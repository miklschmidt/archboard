---
status: proposed
---

# A Blocks solve is laid out in parts across the layout workers

This record proposes, on 2026-11-10, how one Blocks picture uses every layout worker.
It changes one clause of [ADR 0063](0063-blocks-plans-placement-ports-labels-and-trunks-before-routing.md): a dense reading is no longer one solve on one worker.
The decisions of ADR 0063 about placement, routing and the choice between drawings do not change.
The solve port of [ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md) does not change either: the render still asks for one solve for each picture.

## Context

The dense placement of ADR 0063 searches a grid for each width and each way its frames stand together.
It routes each placement at each room. When a line asks for room, it routes that placement again.
On `fix/blocks-dead-space`, one Blocks picture took 405 ms of WebAssembly on average, and 1.7 s at most.
The sample is the 105 readings of this repository's model.
The pool runs up to six workers under Bun and one worker fewer than the cores in a browser.
But one picture sent one solve, so one worker did all of its work while the others waited.

The parts of that work are independent of each other:

- Each placement's search is a pure function with a fixed seed. What it finds is small: the cell of each part.
- Each placement's drawings at a room route their first try from that placement alone.
- The further tries of one drawing depend on its own routes only.

Only the choice between the tries reads them together.
The choice stops asking for room once a drawing reads and runs no long way round.
A crowded reading also keeps the first placement that routes at a room.

## Decision

### The pool lays a solve out across its workers

A pool of two workers or more hands a solve that it does not remember to the core's `layOutAcross`, if no other solve is under way.
A solve asked while another one is under way stays one solve, because parts cost more processor time than one solve, and the workers are shared then.
The core runs on the thread that holds the pool.
It reads the graph, and a Blocks graph that takes a dense placement becomes parts.
The core asks the pool for each part in the same way as for a solve.
The parts wait in the pool's queue in the order they are asked.
The first free worker takes each one, as ADR 0059 states for solves.
Any other graph, and a pool of one worker, stays one solve.

A part is the solve's graph with a `part` member first on its root.
The member names the placement, the room and what the part does.
A worker lays a part out with `layOutPicture`, as it lays out any solve, and answers it as JSON.

There are three kinds of part:

1. A search of one placement, priced as one solve prices it. A crowded reading first scouts each placement, and then searches on with its two cheapest scouts.
2. The drawings of one placement at one room, each routed once. Each routed drawing answers how it ranks, and the drawing that one solve answers for it.
   That drawing wears its trunks' words where one solve dresses it.
3. The further tries of one drawing, from the lines that its first try left wanting room.

### The core makes the choice of one solve

The single solve and the solve in parts make their choice with one piece of code.
It walks the rooms, the placements and the tries in the order of the single solve.
It keeps the best drawing so far by the same rules.
In one solve it routes each try where it stands.
In parts it reads each try from the answer of the part that routed it.
When an answer is missing, the core asks for that part and waits.
So the answer of a solve in parts is the answer of one solve, byte for byte.

The core also asks ahead for parts that the choice will likely read:

- A placement's drawings at every room of the reading, as soon as its search answers.
- The further tries of each drawing whose first try did not read, up to the first drawing whose first try did.

When the choice is made, the core calls off the parts that still wait.
A part that a worker already holds runs to its end.

A drawing that cannot wear its trunks' words again makes the core choose again from the graph with its words, as one solve does.
Three cases leave the answer to one solve of the whole graph: a reading whose rooms all refuse it, a part that fails, and an answer that does not read.

### What the pool remembers

The pool remembers the answer of the solve under its graph, as before, and never a part's answer.
A re-render that asks for a solve again gets that answer at once, and it reaches no worker.
Calling the solve off calls off the parts that still wait for a worker, and refuses the solve with the signal's reason.

## Consequences

We measured the wait for one picture through a pool of real Bun workers and the WebAssembly core of this change.
The sample is the 105 readings of this repository's model, each asked alone after the one before it answered, on 24 cores.
So the pool laid each reading out in parts. Processor time is the sum over the sample.

| workers             | mean   | median | p90     | max     | processor time |
| ------------------- | ------ | ------ | ------- | ------- | -------------- |
| 1, one solve        | 404 ms | 252 ms | 1028 ms | 1694 ms | 42.6 s         |
| 2                   | 253 ms | 144 ms | 657 ms  | 1112 ms | 51.2 s         |
| 4                   | 154 ms | 96 ms  | 361 ms  | 1050 ms | 53.6 s         |
| 6                   | 127 ms | 72 ms  | 291 ms  | 986 ms  | 54.6 s         |
| 6, each solve whole | 402 ms | 251 ms | 1022 ms | 1688 ms | 42.5 s         |

Every answer stays the answer of one solve: all 105 hashes are unchanged for each number of workers.

The parts cost 20 to 28 percent more processor time than one solve. Each part reads the graph and builds the reading again. Each drawing is stood and routed without what one solve kept from the price of its placement. Speculative parts that a worker took before the choice was made also run.

When all 105 readings are asked at once from six workers, the pool lays the first one out in parts and solves the others whole. It answers them all in 8.1 to 8.7 s, against 8.0 to 8.5 s when every solve is whole. When the pool laid every solve out in parts, they took 9.5 s and 55.5 s of processor time, against 45.2 s.
A picture asked while the parts of another picture wait gets a worker only after them, as the queue is first in, first out.

A picture whose search runs long keeps most of its wait. The crowded reading of this repository searches on in one part for about 0.9 s.
If no dense drawing of a reading passes, the parts route its dense tries, and then one solve routes them again before it uses Graphviz.

The WebAssembly memory of a worker grows to what its largest solve needs and stays there.
A worker that solved only parts held 9 to 11 MB. A worker that solved a whole graph held 14 to 20 MB, as before.

The core on the thread of the pool does the choice. It reads every part's answer, and it took at most 4 ms for one picture natively.

## Rejected

- The render core splits the solve and asks the solve port for each part. Then the pool remembers each part as a solve, so it holds many answers for one picture. A re-render also runs the choice again and asks the pool for every part.
- The search part also routes its placement's drawings at the first room. This saves about 2 s of processor time on the sample, but each search answers later. With six workers, the mean wait was 140 ms against 127 ms.
