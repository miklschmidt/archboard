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
  this box take 30 to 40% longer than alone. Since TASK-527 a worker says it
  is ready before its first answer, and since TASK-548.05 the Bun pool stays
  on fast WebAssembly memories ("A ready worker for every solve" below).

These changes could reach the target. None of them was made here.

- Wrap candidates as solves of their own, asked side by side. The path would
  be about the stack prefix plus the slowest candidate, near 300 ms on both
  boards. It needs a change to the solve protocol and costs much more CPU.
- A faster Graphviz (TASK-548.03). TASK-548.01 put Graphviz in the core and
  TASK-548.02 shares Graphviz answers between the solves of a render, both
  beside this work. The partial and whole solves ask the same stack prefix
  graphs.
- A warm pool: a worker start that does not wait for the first answer of
  every worker. TASK-527 made this change.
- About 5.6% of routing time is `routed` called again with the same input.
  A memo could save it.

## Changed drawings

None. The corpus compare against the baseline reported 0 of 2,344 drawings
differ after each change and after the last one.

## A ready worker for every solve (TASK-548.05)

Measured on 2026-10-26 with Bun 1.4.3, the repository's, on the 24-core
box, against the parent commit e05d1abfa. Other agents loaded the box during
all of it: the load average stayed between 25 and 34. The times below are
therefore about twice the times of the sections above and of the task's
notes, measured at load 5 to 11. Compare them only with each other. Agent
workbench left the vault on main (6cae688bb). Its rows render the board as
it was before that commit.

### Every solve goes to a worker at once

A trace through the pool, with a ceiling of six, of a cold Agent workbench.
The render asks eleven solves within 35 ms. The pool sends the first six to
six new workers within 170 ms, one after another. Each worker says it is
ready 24 to 45 ms after it starts. The first answer comes 617 ms after the
first send. No solve waits for another solve's answer while the pool is
below its ceiling. The other five wait because the pool is at its ceiling.

A pool that starts its workers all at once, not one after another, was
measured four times against the pool above. Cold Agent workbench took 2212,
2095, 2134 and 2928 ms against 2325, 2513, 2048 and 3133 ms. Three other
boards showed no direction. The pool keeps one start at a time.

### Fast WebAssembly memories

JavaScriptCore gives a process eight WebAssembly memories that grow in place.
Every memory after them is bounds-checked, so each grow copies the whole
memory. A probe instantiated the core on the main thread and in workers, one
after another. Each instance then grew its memory by one page twenty times,
from 53 pages. Bun 1.4.3 and 1.4.4 gave the same split:

| made first in the process      | grow in place, 0.0 ms | copy, 15 to 33 ms |
| ------------------------------ | --------------------- | ----------------- |
| the main thread's core         | workers 1 to 7        | workers 8 to 12   |
| web-tree-sitter, then the core | workers 1 to 6        | workers 7 to 9    |

web-tree-sitter holds one memory, however many grammars it loads (three were
loaded). The Archboard server loads it for the code check. A worker that
stops gives its memory back: three workers started after three were stopped
grew in place. A module that holds a memory and no code grew in place in
all thirteen instances, so a probe must use the core.

Chromium 155 showed no such limit. Beside a memory of the page's own,
thirty workers each grew a 320-page memory by 200 pages, in 0 to 4 ms each.

The Bun host now runs at most six layout workers: eight, less the main
thread's core and web-tree-sitter. The browser keeps one fewer than the
cores. Agent workbench, cold, through a probe that reports each solve's
memory (median of nine one-page grows after each solve):

| ceiling | render, ms | workers that copy on grow | longest solve                        |
| ------- | ---------- | ------------------------- | ------------------------------------ |
| 23      | 3030       | 8 to 11, 2.6 to 15.7 ms   | 2350 ms on worker 8, 33 to 319 pages |
| 6       | 2196       | none, 0.00 ms             | 1433 ms on worker 6                  |

The ceiling was chosen by alternation. Agent workbench, in ms:

| ceiling | cold             | third of a warm sequence |
| ------- | ---------------- | ------------------------ |
| 23      | 2523, 2660, 2973 | 1581, 1846, 2492         |
| 7       | 2273, 2232, 2369 | 1609, 1680, 1949         |
| 6       | 2564, 2098, 2395 | 1424, 1820, 2065         |

Six and seven measure the same. Six keeps the server's workers on fast
memories after a code check.

### First renders against the parent

`scripts/tmp-warm.ts` (a cold render of one board, or a warm sequence after
the first) and `timing.ts 7` through the real Bun host, alternating parent,
this task, parent, this task. Load average 27 to 31.

| render                               | parent       | TASK-548.05  |
| ------------------------------------ | ------------ | ------------ |
| Agent workbench, cold                | 2709, 2624   | 2417, 2252   |
| Board viewer, cold                   | 5673, 4755   | 5298, 4284   |
| Board viewer before the rebase, cold | 2026, 1967   | 1861, 2020   |
| Board viewer, warm sequence          | 5009, 4378   | 4318, 4888   |
| Browser application, warm sequence   | 3100, 3146   | 2410, 2822   |
| Agent workbench, warm sequence       | 1614, 1825   | 1633, 2368   |
| every vault board once, total        | 22743, 22210 | 22191, 20804 |
| timing.ts first renders, total       | 23623, 24312 | 23595, 25147 |
| timing.ts renders again, total       | 688, 723     | 809, 934     |

First renders of timing.ts, in ms:

| board                   | parent     | TASK-548.05 |
| ----------------------- | ---------- | ----------- |
| Board viewer            | 4294, 4756 | 4636, 4822  |
| Archboard server routes | 3982, 4055 | 2612, 2708  |
| Board persistence       | 3328, 3413 | 3951, 3456  |
| Browser application     | 2601, 2539 | 2315, 2356  |
| Codex realtime voice    | 2243, 2631 | 2168, 3262  |
| Command interface       | 1197, 1227 | 1342, 1238  |

A cold first render of every vault board, each in a process of its own
after the one small render of `tmp-warm.ts`, alternating the same way at
load 29 to 32, in ms:

| board                   | parent       | TASK-548.05  |
| ----------------------- | ------------ | ------------ |
| Agent workbench         | 2931, 2881   | 2146, 2161   |
| Board viewer            | 5040, 4490   | 5555, 5363   |
| Board persistence       | 4386, 4046   | 3694, 3820   |
| Archboard server routes | 3943, 4138   | 3598, 3254   |
| Browser application     | 3780, 3942   | 2899, 3407   |
| Codex realtime voice    | 3404, 3712   | 2805, 3633   |
| Command interface       | 2060, 2307   | 1731, 1824   |
| Skill evaluation        | 1324, 1183   | 780, 885     |
| Semantic renderer       | 1085, 1177   | 1325, 1370   |
| all 18 boards, total    | 35252, 35443 | 31321, 33297 |

Board viewer's cold render was traced three more times at each ceiling,
alternating. Its longest solve ran on a fast memory at both ceilings and was
sent within 0.2 s of the first: 5072, 4991 and 4785 ms of solve and 5512,
5564 and 5240 ms of render at 23 workers; 5007, 4724 and 4467 ms and 5575,
5175 and 4797 ms at six. The ceiling does not slow it.

Archboard server routes gains in every run: a fifth to a third in timing.ts
and the vault sequence, a tenth to a fifth cold. Cold Agent workbench gains
a tenth to a quarter, and all 18 cold renders together 6 to 11%. The other
differences are within the noise of this load. The second run of this task had a load spike during timing.ts:
its renders again took twice as long on several boards.

### Measured and not kept

- A memory reserve at worker start. Allocating and freeing 32 MiB through
  the core's own allocator keeps every solve from growing memory. On fast
  memories that saves nothing measurable: cold Agent workbench took 2714,
  2104 and 2313 ms with it and 2186, 2571 and 2198 ms without, and each
  solve took the same time. No `reserveMemory` export was added.
- Stopping a worker whose solve was called off. The pool cannot tell a
  dropped solve from one that a choice called off but may still read: both
  abort the same signal, and the layout shares a called-off solve's answer
  with a later turn (TASK-464). A dropped solve of a cold Agent workbench
  kept its worker 0.9 s after the render dropped it.

### Drawings and tests

No drawing changed. The corpus of current variants, rendered with `--jobs 1`
under the parent and under this task, compared 0 of 2,376 drawings
different.

At this load `bun test packages/renderer` fails under the parent and under
this task alike, on the 3 s bound for a first layout in
`wide-boards.test.ts`. In two runs each, the parent failed it on Archboard
server routes, Board persistence and Board viewer, and this task on Board
persistence and Board viewer. The `test:modules` lane, which runs each file
in isolation, passed.

### What stands between these boards and 500 ms now

Not the pool. Each slow board waits on one solve. A trace with a ceiling of
six, at load 25 to 28, gave each board's render and its three longest solves:

| board                   | render, ms | longest solves, ms | before the rebase: render, longest solves, ms |
| ----------------------- | ---------- | ------------------ | --------------------------------------------- |
| Board viewer            | 3815       | 1794, 2010, 3487   | about 2000 (above), 1631 the longest          |
| Board persistence       | 3597       | 1230, 1664, 3200   | 1326; 622, 768, 977                           |
| Archboard server routes | 2842       | 638, 698, 2163     | 904; 460, 464, 523                            |

"Before the rebase" is the board as b39ce7afa held it, drawn by this code.
The boards that the rebase onto main left (889af5401, 3194b3b2e) ask for
solves two to four times longer. The work on the core's layout and on
Graphviz must take those solves on.

### The ceiling again, after deterministic layout (2026-10-28)

The ceiling of six was chosen at load 25 to 34. Since TASK-548.08, a render
asks for one solve, so it was measured again on a quiet machine (load 2.4
to 4.1) on 25b0662fd. Each run is a new process. It renders the 23 items of
`timing.ts` cold, with a temporary override of the ceiling. The ceilings
alternated six times. Medians in ms:

| ceiling | all 23 at once | one after another |
| ------- | -------------- | ----------------- |
| 6       | 1107           | 2280              |
| 7       | 1114           | 2268              |
| 12      | 1135           | 2289              |
| 23      | 1141           | 2281              |

One after another, a render uses one worker, so the ceiling does not
matter. All at once, more workers do not help: past six they are slightly
slower, which fits the slower memories of the workers past Bun's limit. The
ceiling stays at six.

## The wrap search split between solves (TASK-548.06)

### What the critical solve did

A temporary trace in the native `critical_path` example on b39ce7afa showed
the critical solve of both boards. Both are the whole solve that the stacking
choice chose, drawn inline, and the root block is the first block that could
stack.

| board           | stack prefix, ms | sink checks, ms | rest, ms |
| --------------- | ---------------- | --------------- | -------- |
| Agent workbench | 252              | 326 (8 checks)  | 6        |
| Board viewer    | 311              | 365 (8 checks)  | 8        |

Every sink check is one Graphviz call of 35 to 55 ms, and in both solves
every candidate sank. The partial solve of the same stacking way lays the
same stack prefix and then stops. So when it stops, it already knows the
candidates of the wrap search: they come from the block laid whole.

### What changed

The design uses the partial solves that the stacking choice already asks.
It does not use shares of candidates, which would make each extra solve
repeat the stack prefix of 250 to 310 ms.

- A partial solve tells, beside what its block stood at, the wrap search of
  that block: the score that a wrap must beat, and each candidate (the grid,
  or a lowered plan with its columns held or free), in the order that the
  search weighs them (`archboard.blocks.wraps`).
- Drawn inline, each whole solve of the stacking choice lays that block with
  no wrap (`archboard.blocks.wrap` is `null`). It makes no sink check. Every
  other wrap search of the solve is the same as before.
- When a partial solve answers first, the solves for its way are asked at
  once: one solve for each candidate (`archboard.blocks.wrap` names the
  candidate and the score it must beat). When a partial solve answers last,
  the choice is known, so only the chosen way asks its solves. Such a solve
  does not lay the block whole. It tries its one candidate. It answers no
  drawing when the candidate sinks a card. When the candidate cannot beat the
  score, it answers only what the search weighs the candidate on
  (`archboard.blocks.wrapped`). Otherwise it lays the whole board with that
  wrap.
- When every candidate has answered, the choice weighs them in search order
  with the search's own comparison (`wraps.rs`, `kept_of`). If the search
  keeps a candidate, that candidate's drawing is used, and the whole solve
  with no wrap is called off. Otherwise the whole solve gives the drawing.
  The way that is not chosen is called off together with its candidates.
- With groups packed, the search is not split. Each group is a block of its
  own, and in Agent workbench those partial and whole solves took 90 to
  134 ms. The split added 12 solves there and gained nothing.

Each solve's answer is the same as before. For a candidate that the search
keeps, the solve laid with that candidate alone makes the same calls as the
whole solve after its search. A candidate whose score is not above the
required score can never be kept. Across the 23 `timing.ts` boards, the
split keeps a candidate on Archboard, Board rasterizer and Browser
application, and keeps none on the other boards.

`crates/archboard-layout/tests/async_solves.rs` holds the order of the asks,
the call-off of the way not chosen and of the whole solve, the choice between
the candidates' answers in either order, and the failure paths.

### Measured and not kept

The first version asked the candidates only after both partial solves had
answered. Each candidate that sank no card then laid the whole board. Agent
workbench got slower (496 to 543 ms). One of its candidates sinks no card
but cannot beat the score, and its solve laid the board after the partial
solve. Now such a solve stops when it has weighed the candidate. A partial
solve that answers first also asks its candidates at once.

### Critical paths after

These are the native `critical_path` example, best of 3 rounds, on the
`timing.ts` requests. During all of the runs below, about 15 spinning
`bun.native` processes of another worktree kept the 24-core box at a load
of 21 to 35. The parent and this branch were run alternately with the
example built once for each.

| run                             | Agent workbench, ms | Board viewer, ms |
| ------------------------------- | ------------------- | ---------------- |
| parent, load 11 (12:04)         | 496                 | 557              |
| parent, alternating, load 30-34 | 688 to 821          | 867 to 928       |
| after, alternating, load 31-34  | 503 to 648          | 605 to 765       |
| after, load 21 (13:01)          | 394                 | 430              |
| after, load 28 (12:49)          | 367                 | 435              |

Agent workbench asks 19 solves instead of 11, and Board viewer asks 16
instead of 8. The extra solves are candidates of 30 to 50 ms each when they
sink a card. The solve CPU stays near the parent's, because the whole solves
no longer make the sink checks. At load 21 to 28, Agent workbench took 3.1 to
3.4 s and Board viewer 2.5 to 3.2 s. The parent took 3.2 s and 2.4 s at load
11, and 4.6 to 5.4 s and 3.5 to 3.6 s at load 30 to 35.

Now the path of Board viewer is the partial solve of the stacked way (430 ms
at load 21). The stacking choice waits for it, but the chosen way is the
plain one. The path of Agent workbench is one of two things: a joins solve of
the groups nesting with blocks kept apart, which is not split (about 360 ms at
load 11 on the parent), or the plain partial solve and then the one candidate
that sinks no card (156 + 238 ms at load 21).

### Through the pool

`bun docs/design/wide-board-layout-fixtures/timing.ts 7`, alternating the
parent b39ce7afa and this branch, with the core built from each before each
run. The round marked "early" ran the first version, which also split the
groups nesting.

| run          | load at start | first total, ms | Agent workbench | Board viewer |
| ------------ | ------------- | --------------- | --------------- | ------------ |
| parent       | 32.8          | 11380           | 1858            | 1158         |
| after, early | 29.6          | 11380           | 1885            | 1213         |
| after        | 21.4          | 7958            | 1500            | 991          |
| parent       | 28.5          | 13860           | 1863            | 1742         |
| after        | 34.8          | 14776           | 2728            | 1673         |
| parent       | 29.0          | 13429           | 2091            | 1174         |

A re-render after a card grows: a scratch script rendered the board through
the pool, then the same content with one card's name made one line longer
(Workhorse queue on Agent workbench, Camera arithmetic on Board viewer), and
timed the second render.

| run          | Agent workbench, ms | Board viewer, ms |
| ------------ | ------------------- | ---------------- |
| parent       | 1911                | 1685             |
| after, early | 1305                | 1240             |
| after        | 1104                | 1038             |
| parent       | 2527                | 1773             |
| after        | 1623                | 1744             |
| parent       | 1715                | 1615             |

At this load, the first renders through the pool do not show the gain of the
critical path. The pool starts one worker at a time, and only after every
worker has answered a solve. It sends solves to workers in the order they
were asked, so on a cold pool the candidates wait behind longer solves
(TASK-548.05). After a card grows, the workers of the first render are ready.
Agent workbench re-rendered faster in every round of this branch than in the
parent round next to it, and Board viewer in two of three. The load was too
high and too variable for a reliable number.

### What still stands between them and 500 ms

- Through the pool: the workers that are not ready (TASK-548.05). With more
  solves to send, this change needs ready workers even more.
- Board viewer: the partial solve of the way that the choice does not keep.
- Agent workbench: the joins solves of the groups nesting. Each makes a full
  wrap search of about 220 ms and keeps a wrap. They have no partial solve
  that could tell the search.
