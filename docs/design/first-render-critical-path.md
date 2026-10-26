# The critical path of a first render (2026-10-26, TASK-548.04)

This note measures where the slowest first renders spend their time and
records what TASK-548.04 changed in the core's own layout. The owner's
target is a first render under 500 ms for complex boards such as Agent
workbench and Board viewer. Before this work they took 1.5 to 1.7 s.

No drawing changed. After every change below, the corpus compare reported 0
of 2,344 drawings differ from the baseline. No board's meaning changed.

## How it was measured

A render asks the `Solver` port for solves. Each solve is one call of
`lay_out_board` in a layout worker, and each solve calls Graphviz through the
`Graphviz` trait. The critical path is the longest chain of solves where one
solve waits for the answer of another.

Two tools measure the critical path of the `timing.ts` boards. Run both
inside `nix develop`.

1. After `bun run build:core`, write the render request of each board, with
   the icons the core was given:
   `bun packages/renderer/tests/runtime/support/capture-render-requests.ts <requests dir> [board ...]`.
2. Draw each request again with a native build of the core and its own
   Graphviz (ADR 0060):
   `cargo run --release -p archboard-render --example critical_path -- <requests dir> [rounds] [board ...]`.
   The example lays out each solve at once and times its Graphviz calls
   apart. On its clock, a solve answers at the time it was asked plus the
   time it took. Thus every solve has a worker of its own. A solve that the
   render dropped answers nothing. For each board the example prints the
   round with the shortest path. The line gives the solves, their time and
   the Graphviz part of it, and the time of dropped solves. It also gives the
   critical path and the render's own time beside its solves. The lines below
   it give the chain of solves on the path.

For a profile, build with line tables and record the example:

```sh
CARGO_PROFILE_RELEASE_DEBUG=line-tables-only cargo build --release -p archboard-render --example critical_path
nix shell nixpkgs#perf --command perf record -e task-clock:u --call-graph dwarf,32768 --user-callchains -o /tmp/critical-path.perf target/release/examples/critical_path <requests dir> 1 "Board viewer"
```

The tables below the next heading and in "Critical paths after" were
measured with the tools of commit c78d1bcfb. Those tools recorded the solves in
the WebAssembly core with viz-js as Graphviz, and replayed them natively.
Since TASK-548.01 Graphviz runs inside the core, and a host cannot see its
calls. "On the in-core Graphviz" gives the numbers of the native tool.

## The critical path before

On every slow board the critical path was the stacking choice
(`architecture/choosing.rs`, `stacked_solved`). The choice asked two partial
solves, which stop once they know whether the first block that can stack
stacks (TASK-512). Only after both answered did it ask the whole solve laid
the chosen way. The whole solve then repeated the partial solve's work and
went on. The joins choice and the regions choice ran their solves side by
side, so they did not add to the path.

| board           | partial solve, ms (Graphviz / core) | whole solve, ms (Graphviz / core) | path, ms |
| --------------- | ----------------------------------- | --------------------------------- | -------- |
| Agent workbench | 461 (159 / 302)                     | 856 (446 / 410)                   | 1318     |
| Board viewer    | 685 (292 / 392)                     | 818 (528 / 290)                   | 1503     |

The whole solve has these phases: the stack prefix (the blocks laid both
ways, then the stood and settled choice), the wrap search (`blocks/wraps.rs`),
the fold, the passes for exits and held orders, the final settlement and the
assembly. In both boards above, the wrap search ends with no wrap. It first
makes 8 or 9 sink checks one after another. Each check is one Graphviz call
(`lined`) of 35 to 53 ms.

In the core, a native profile of all recorded solves showed this split of
routing time: the relay laps (`track/relay.rs`, with the cheapest-path search
in `traffic.rs` and `sweep.rs`) 35%, `part_and_close` 14%, straightening
through labels 13%, `straighten_lanes` 10%, and the descend search 14%.
Occupancy (`track/occupancy.rs`) and allocation ran through all of them.

## What changed

The core changes leave each solve's answer the same and make it cheaper.
The gains are native replay time over all recorded solves, 7.24 s before and
5.47 s after (24.5% less).

| change                                                            | commit    | gain |
| ----------------------------------------------------------------- | --------- | ---- |
| `ByBand` is a dense array by band, not a map (`track/chains.rs`)  | a7b30b49c | 7%   |
| The relay counts crossings once and costs a move only if it moves | 239ab9892 | 6%   |
| A band's wall stretches are worked out once for what it holds     | 280c6a0af | 10%  |
| `take_all` makes room once for many lanes                         | 5772841d4 | 2.7% |
| A wall is known by a number, not by its name                      | c8aed6cac | 1.4% |

The structural change is in the stacking choice (71853382c, 065b47c83).

- Drawn inline, a board whose graph shows that no block could stack
  (`blocks/choosing.rs`, `could_stack`) asks one solve. That solve lays the
  whole board.
- Otherwise the two partial solves are asked first. If they do not answer at
  once, the whole board laid each way is also asked, one turn after every
  other solve that the render is sure to need. When the partial solves
  answer, the whole solve that they do not choose is called off. A host that
  did not start it never lays it out. The render then waits for the longer
  of the partial solve and the chosen whole solve, not for both in a row.
- The whole solves wait one turn so that they do not take a worker from a
  solve that the render needs. Asked at once, they made Agent workbench
  slower in the pool (1.9 to 2.0 s against 1.7 to 1.8 s).

`crates/archboard-layout/tests/async_solves.rs` holds the order of the asks,
the call-off and the failure paths.

## Measured and not kept

Two whole solves in place of the partial solves (option A) drew every
drawing the same. But some boards got slower, because a whole solve takes
longer than a partial one. The critical path rose for Archboard server routes
(506 to 1150 ms), Board persistence (795 to 1155 ms) and Browser application
(702 to 1510 ms).

A tighter bound in the sweep of `sweep.rs` and a loop that skipped
unreachable entries gave no measurable gain.

An engine pool that starts its workers at once, not one after another, was
measured only in a copy of the tree. The results were too noisy to keep, and
the pool belongs to TASK-548.01.

## Critical paths after

Recorded with the tools of commit c78d1bcfb, one worker for each solve:

| board                   | path before, ms | path after, ms | solve CPU before, ms | solve CPU after, ms |
| ----------------------- | --------------- | -------------- | -------------------- | ------------------- |
| Agent workbench         | 1318            | 729            | 3703                 | 4551                |
| Board viewer            | 1503            | 758            | 2671                 | 3384                |
| Board persistence       | 795             | 383            | 1488                 | 2458                |
| Browser application     | 702             | 355            | 1644                 | 2968                |
| Live panes              | 680             | 302            | 1554                 | 1783                |
| Semantic renderer       | 696             | 469            | 821                  | 850                 |
| Command interface       | 620             | 353            | 1339                 | 2439                |
| Board rasterizer        | 591             | 396            | 824                  | 889                 |
| Archboard server routes | 506             | 268            | 1197                 | 2177                |
| All 23 boards           | 9226            | 5215           | 18859                | 25623               |

The capture runs every whole solve to its end, also the one that is called
off, so the CPU column is the upper bound of the extra work. In the pool, a
called-off solve that has not started costs nothing.

## Timing through the pool

`bun docs/design/wide-board-layout-fixtures/timing.ts 7` renders through the
worker pool, as the server does. The base is e84d2c488, the commit before this
work. The runs alternated base, after, base, after on the same box, which two
other agents shared (load average 5.4 to 6.7).

| run   | first total, ms | again total, ms |
| ----- | --------------- | --------------- |
| base  | 10179, 10426    | 385, 393        |
| after | 8722, 8289      | 392, 392        |

First render of the slowest boards, in ms:

| board                   | base       | after      |
| ----------------------- | ---------- | ---------- |
| Agent workbench         | 1686, 1733 | 1572, 1588 |
| Board viewer            | 1548, 1547 | 1208, 1065 |
| Board persistence       | 817, 836   | 592, 473   |
| Browser application     | 724, 798   | 622, 541   |
| Live panes              | 714, 740   | 561, 444   |
| Semantic renderer       | 722, 730   | 576, 612   |
| Command interface       | 653, 675   | 579, 532   |
| Board rasterizer        | 615, 649   | 613, 628   |
| Archboard server routes | 552, 585   | 493, 497   |
| Archboard               | 489, 495   | 533, 540   |

Agent workbench gains much less through the pool than its critical path
gains (1318 to 729 ms). The pool starts its workers one at a time, so the
render's eleven solves queue, and solves side by side run slower than alone.
Archboard is about 45 ms slower. Its cause was not traced. The probable cause
is the whole solves that are asked beside the partial solves, because they
take workers.

## On the in-core Graphviz

These numbers are from the `critical_path` example on `feat/faster-first-render`.
That branch holds this work, TASK-548.01 (Graphviz in the core) and
TASK-548.02 (shared Graphviz and solve answers in the pool). The example ran three rounds of each board. It runs
the native core, not the WebAssembly core of the pool, and it does not share
answers between solves as the pool does. Thus its paths are not the pool's
times, and they do not compare one for one with the tables above.

| board               | critical path, ms | Graphviz of it, ms | solve CPU, ms | dropped, ms |
| ------------------- | ----------------- | ------------------ | ------------- | ----------- |
| Agent workbench     | 644               | 431                | 3924          | 1156        |
| Board viewer        | 647               | 478                | 2717          | 744         |
| Semantic renderer   | 398               | 260                | 721           | 118         |
| Command interface   | 345               | 307                | 2227          | 1091        |
| Board rasterizer    | 342               | 213                | 761           | 157         |
| Board persistence   | 315               | 158                | 2112          | 959         |
| Browser application | 305               | 199                | 2585          | 1337        |
| All 23 boards       | 4517              |                    |               |             |

On every board the path is one solve, asked at the start. On Agent workbench
and Board viewer it is the whole solve that the stacking choice chose, and
Graphviz is 67% and 74% of it. The partial solves answer earlier, beside it.
The render's own work beside its solves is 29 to 41 ms.

## What still stands between them and 500 ms

The critical path of Agent workbench and Board viewer is now one whole solve.
With viz-js it took 730 to 760 ms with no queueing, and Graphviz was about 65%
of it. With the in-core Graphviz the native example measures 644 and 647 ms,
and Graphviz is 67% and 74% of it.

- The stack prefix of the whole solve: Board viewer 159 ms in Graphviz and
  155 ms in the core, Agent workbench 91 ms and 99 ms.
- The sink checks of the wrap search: Board viewer makes 8 Graphviz calls one
  after another, about 365 ms, and keeps no wrap. Agent workbench makes 9 and
  lays one candidate (110 ms core, 77 ms Graphviz).
- The pool: it starts one worker at a time, after every worker answered its
  first solve, so a cold pool queues solves. Solves that run side by side on
  this box take 30 to 40% longer than alone.

These changes could reach the target. None of them was made here.

- Wrap candidates as solves of their own, asked side by side. The path would
  be about the stack prefix plus the slowest candidate, near 300 ms on both
  boards. It needs a change to the solve protocol and costs much more CPU.
- A faster Graphviz (TASK-548.03). TASK-548.01 put Graphviz in the core and
  TASK-548.02 shares Graphviz answers between the solves of a render, both
  beside this work. The partial and whole solves ask the same stack prefix
  graphs.
- A warm pool: a worker start that does not wait for the first answer of
  every worker.
- About 5.6% of routing time is `routed` called again with the same input.
  A memo could save it.

## Changed drawings

None. The corpus compare against the baseline reported 0 of 2,344 drawings
differ after each change and after the last one.
