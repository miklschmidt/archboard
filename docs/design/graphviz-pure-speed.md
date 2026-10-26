# graphviz-pure lays our graphs out faster, to the same bytes (TASK-548.03)

The core lays out the graphs of a solve with the vendored graphviz-pure
([ADR 0060](../adr/0060-the-core-lays-graphs-out-with-a-vendored-graphviz-pure.md)).
TASK-548.03 made it faster. Every answer it gives is the same, byte for byte,
so no drawing changed. This note records how the speed was measured, where
the time went before and after, what each change gained, and what is left
against the target of a first render under 500 ms.

## How it was measured

An oracle is a set of graphs with the answers they must get. A temporary,
uncommitted patch of the Bun layout worker recorded every solve that the worker
received. It ran over the corpus (`scripts/render-corpus.ts`, current variants,
both engines) and over the first renders of `timing.ts 7`. A harness outside
the repository replayed the solves through the core with a recording
Graphviz port. That gave 2,106 distinct graph and answer pairs. 1,072 of them
are the Graphviz calls of the 23 first renders that `timing.ts` measures
(713 distinct graphs).

The harness builds `archboard-graphviz` natively and as WebAssembly
(`wasm-bindgen --target nodejs`). Each change was kept only if all 2,106 pairs
got the same answer, byte for byte, both natively and as WebAssembly. The
timing set ran pinned to the performance cores of the machine (`taskset -c
2-15`). Natively, `perf stat` counted user-space instructions and cycles,
because wall time on this shared, hybrid machine moves by several percent.

## Before and after

The 1,072 calls of the timing set, base `1db8eb36b` against the branch,
alternated, two runs each. A wall time is one replay of the calls. The
instructions and cycles count two replays:

| Build                    | Before              | After             | Change |
| ------------------------ | ------------------- | ----------------- | ------ |
| Native, wall time        | 9,042 to 9,277 ms   | 6,562 to 6,856 ms | -28%   |
| Native, instructions     | 304.6 G             | 192.4 G           | -37%   |
| Native, cycles           | 95.8 G and 97.9 G   | 69.9 G and 71.0 G | -28%   |
| WebAssembly in Bun (JSC) | 10,757 to 11,192 ms | 7,152 to 7,257 ms | -34%   |
| WebAssembly in Node (V8) | 11,083 to 11,152 ms | 7,272 to 7,368 ms | -34%   |

The first renders that `docs/design/wide-board-layout-fixtures/timing.ts 7`
measures, base and branch alternated, two runs each, at a load average of 3.3
to 3.9. The base ran from an export of `1db8eb36b` with its own core build:

| Run      | All 23 first renders | Agent workbench | Board viewer |
| -------- | -------------------- | --------------- | ------------ |
| Before 1 | 10,556 ms            | 1,669 ms        | 1,605 ms     |
| After 1  | 8,559 ms             | 1,359 ms        | 1,346 ms     |
| Before 2 | 10,601 ms            | 1,680 ms        | 1,617 ms     |
| After 2  | 8,645 ms             | 1,398 ms        | 1,347 ms     |

Each commit, measured on its own, one native run and the faster of two
WebAssembly runs in Bun, on the same 1,072 calls:

| Commit      | Change                                    | Native instructions | Native cycles | WebAssembly in Bun |
| ----------- | ----------------------------------------- | ------------------- | ------------- | ------------------ |
| `1db8eb36b` | base                                      | 153.2 G             | 48.1 G        | 10,960 ms          |
| `882cf51c0` | `mincross` stops repeating itself         | 109.5 G             | 39.3 G        | 9,083 ms           |
| `92f400912` | fused samples only where they decide      | 111.3 G             | 39.1 G        | 8,420 ms           |
| `08bac1de2` | `fmt_g` prints certain digits directly    | 106.4 G             | 37.7 G        | 8,071 ms           |
| `ff65cc263` | `reorder` copies a rank into one array    | 105.1 G             | 37.8 G        | 7,995 ms           |
| `fb11b7193` | no DOT text between the core and Graphviz | 98.4 G              | 35.6 G        | 7,330 ms           |
| `e294e3b5e` | spline ends formatted only for `-v`       | 97.0 G              | 35.6 G        | 7,178 ms           |

The fused-sample change costs a little natively, where the processor has a
fused multiply-add instruction, and saves 663 ms as WebAssembly, which has
none.

## Where the time went

A CPU profile of the 1,072 calls as WebAssembly in Node, from a build that
keeps the layout's functions out of line so that each one shows. Each row is
the time inside that part, with what it calls. The run before shared the
machine with a lint run, so its milliseconds are a little high. The shares
compare.

| Part                                        | Before          | After          |
| ------------------------------------------- | --------------- | -------------- |
| All calls                                   | 11,756 ms       | 7,654 ms       |
| JSON read, cgraph replay, DOT text or graph | 207 ms (1.8%)   | 480 ms (6.3%)  |
| DOT parsed (`parse_dot`)                    | 794 ms (6.8%)   | none           |
| Crossing reduction (`mincross`)             | 5,244 ms (45%)  | 2,927 ms (38%) |
| Positions (`dot_position`)                  | 1,129 ms (9.6%) | 1,099 ms (14%) |
| Routes (`dot_splines`)                      | 2,349 ms (20%)  | 1,588 ms (21%) |
| of which software `fma`                     | 1,103 ms (9.4%) | 176 ms (2.3%)  |
| json0 written (`render_graph_named`)        | 1,198 ms (10%)  | 753 ms (9.8%)  |
| Allocator, its own time                     | about 820 ms    | about 725 ms   |

Inside crossing reduction, after the change: `transpose` takes 1,357 ms, of
which `in_cross` and `out_cross` count crossings for 952 ms. `reorder` takes
751 ms, against 2,456 ms before. In the network simplex of positions,
`dfs_range` takes 488 ms of the 1,037 ms of `rank2`. In routing,
`pshortestpath` takes 752 ms, and `isdiagonal` 391 ms of it.

## Each change

1. `mincross` stops repeating itself (`mincross.rs`, `mincross_repeat.rs`).
   archboard sets `mclimit=4`, so a crossing pass runs up to 96 iterations and
   stops after 32 without a better result. On our graphs most passes fall into
   a cycle: an iteration leaves the ranks exactly as an earlier one left them,
   with the same phase of the four-step schedule. From then on every iteration
   repeats a recorded one. The pass now records what each iteration leaves (the
   rank arrays, the orders, the medians and the crossing caches). When an
   iteration repeats one, the pass plays the rest of its iterations out on the
   recorded crossing counts, saves the best one as C would, and leaves the
   ranks as the last iteration would. `reorder` stops at the first pass that
   exchanges nothing, because a pass that exchanges nothing leaves the rank
   as it found it.
2. `limit_boxes` and `ccw` find fused results only where they decide
   (`routespl.rs`, `triang.rs`). WebAssembly has no fused multiply-add, and the
   core's exact software `fma` was 9.4% of a WebAssembly call. `limit_boxes`
   samples each Bézier segment with plain arithmetic. A plain sample differs
   from the fused one by less than `1e-12` times the largest coordinate. Only a
   sample that close to a box's rows or to a box's smallest or largest x gets its fused
   value. `ccw` keeps the plain product's sign when the sum is larger than the
   product's rounding error, so the sign is certain.
3. `fmt_g` prints certain digits without exact conversions (`diag.rs`). json0
   writes every coordinate through `%.5g`. Where the scaled double is clearly
   away from a rounding tie and from the next power of ten, its rounded
   integer is the exact digits. Elsewhere the exact path runs as before. 180
   million random values print the same.
4. `reorder` copies a rank into one array (`mincross_rank.rs`). `reorder` ran
   1.3 million times on ranks of 11 nodes on average, so its seven allocations
   for each call cost more than its passes.
5. The core hands Graphviz its graph without DOT text (`statements.rs`,
   `render_made`). `archboard-graphviz` wrote DOT, and the parser read it
   back. The statements now go to the parser's own actions, which make the
   graph the parser reads from their DOT text. A test holds the made graph
   equal to the parsed one, and so did all 2,106 captured graphs. A graph whose
   JSON holds a backslash or a character that graphviz-pure keeps for a raw
   byte still goes through DOT.
6. `routesplines_` formats a spline's ends only for `-v`. It wrote them as text
   for two messages that only `-v` prints.

`crates/vendor/README.md` lists the changed files. Each change says
`archboard:` where it is.

These experiments did not help, and were taken back: a reorder that detects a
repeat of period two, copies of the rank ends at each transpose step (slower),
a Fenwick tree for `rcross` (ranks are too small), detection of repeated whole
passes, and a memo of transpose steps.

## The critical path against 500 ms

`timing.ts` lays a board out in several solves on parallel workers, so a
first render waits for its slowest chain of solves, not for all of them. The
worker patch stamped each solve's start and end. For each board, the chain
below is the last solve to end, the solve that ended last before it started,
and so on. Its Graphviz time is each graph of those solves laid out again as
WebAssembly in Bun, the fastest of three. The chain was taken on the base
commit, and the answers are the same after, so the solves are the same.

| Board               | First render, base | Chain of solves | Graphviz on the chain, before | After  |
| ------------------- | ------------------ | --------------- | ----------------------------- | ------ |
| Agent workbench     | 1,522 ms           | 3, 1,417 ms     | 794 ms                        | 493 ms |
| Board viewer        | 1,511 ms           | 2, 1,445 ms     | 856 ms                        | 621 ms |
| Board persistence   | 796 ms             | 2, 755 ms       | 453 ms                        | 279 ms |
| Browser application | 757 ms             | 2, 719 ms       | 396 ms                        | 271 ms |
| Semantic renderer   | 713 ms             | 2, 677 ms       | 398 ms                        | 291 ms |
| Live panes          | 654 ms             | 2, 618 ms       | 388 ms                        | 213 ms |
| Command interface   | 609 ms             | 2, 565 ms       | 491 ms                        | 309 ms |

Graphviz alone still takes 621 ms of Board viewer's chain, more than the
whole target of 500 ms. The first solve of that chain lays out 4 graphs of
162 nodes and 338 edges, at 53 to 55 ms each. The second lays out 12 graphs of
162 nodes and 286 to 292 edges, at 31 to 42 ms each. These 16 graphs differ
from each other only a little, but no two are the same, so a cache of answers
(TASK-548.02) does not shorten this chain. Over all 1,072 calls, 359 repeat a
graph that an earlier call laid out. The rest of each chain is the core's own
layout (TASK-548.04). So no change to Graphviz alone brings these boards under
500 ms. The layout must also ask Graphviz fewer, or smaller, questions for each
solve.

## What is left, for the owner to decide

These were not done, because they change an answer or reach outside the
scope of this task:

- A typed answer for the `Graphviz` port. The layout reads only node
  positions, cluster boxes, edge points and ids, and the root box. json0 text
  is 9.8% of a call, and the layout parses it again. A typed answer needs a
  change to the port in `archboard-layout`. TASK-548.02 keys its cache by the
  text, so the two tasks must agree first.
- A faster allocator for the WebAssembly core. dlmalloc takes about 9% of a
  call. A different allocator is a new dependency in the WebAssembly crate,
  which TASK-548.02 owns. The gain is not measured.
- `mclimit=1` in place of `mclimit=4` (`crates/archboard-layout/src/blocks/card_layout.rs`).
  Measured on the 1,072 calls as WebAssembly in Bun: 5,681 ms against
  7,180 ms, 21% less. But 602 of the 1,072 answers change, so drawings
  change. `remincross=false` saves 17% and changes 626 answers. Each is the
  owner's decision, with the corpus and the drawn checks as evidence.

## Every drawing is the same

`bun scripts/render-corpus.ts render /tmp/t548/03-after --variants current --jobs 1`,
then `compare` against a render of the base commit: 0 of 2,344 drawings
differ. Against the older render `/tmp/t548/base`, the only differences are
216 drawings that only one side has, under variant names that the vault
renamed since then. The base commit's own render shows the same 216.

## The critical solves, faster again (TASK-548.07)

TASK-548.07 made graphviz-pure faster for the graphs of the two slowest first
renders, Agent workbench and Board viewer, again to the same answers byte for
byte. The base is `b39ce7afa`. The `critical_path` example of
`archboard-render` names each board's critical solve: the solve that its first
render waits for longest. That is solve 8 of Agent workbench, with 13 Graphviz
calls, and solve 5 of Board viewer, with 12.

### How it was measured

The oracle of TASK-548.03 (2,106 pairs) got two more sets. The first holds the
223 Graphviz calls of all 19 solves of the two first renders (163 distinct
graphs). The second holds the 25 calls of the two critical solves. A harness
outside the repository replayed them through `archboard-graphviz`, natively
and as WebAssembly in Bun. Each change was kept only if every pair of the
three sets got the same answer.

The machine was shared, with a load average of 24 to 41 on 24 hardware
threads, during all of the measurements below. Instruction counts do not move
with load. Wall times move by 10% and more, so each one is alternated with the
base.

### Before and after

The wall times below were measured at `db587cf0b`, which still held the
network simplex copy that `1b616a63a` took back. That copy made no difference
in time that stood out from the noise (see the commits below). The instruction
counts are of the final branch.

The `critical_path` example (`target/release/examples/critical_path`),
built from the base and from the branch, alternated, four runs each, at a load
of 24.5 to 26.9. The medians, with the range of the four runs:

| Measure                        | Before                    | After                     | Change |
| ------------------------------ | ------------------------- | ------------------------- | ------ |
| Agent workbench, Graphviz      | 381 ms (343 to 385)       | 296 ms (275 to 320)       | -22%   |
| Agent workbench, critical path | 679 ms (604 to 685)       | 578 ms (538 to 622)       | -15%   |
| Board viewer, Graphviz         | 522 ms (515 to 527)       | 418 ms (408 to 435)       | -20%   |
| Board viewer, critical path    | 757 ms (748 to 762)       | 652 ms (639 to 679)       | -14%   |
| Both boards drawn              | 1,435 ms (1,353 to 1,447) | 1,224 ms (1,190 to 1,301) | -15%   |

The 25 calls of the two critical solves, replayed alone:

| Build                                               | Before  | After   | Change |
| --------------------------------------------------- | ------- | ------- | ------ |
| Native, Agent workbench, instructions               | 4.010 G | 3.037 G | -24%   |
| Native, Board viewer, instructions                  | 5.648 G | 4.237 G | -25%   |
| Native, both, cycles of five replays, load 35 to 38 | 24.61 G | 20.71 G | -16%   |
| WebAssembly in Bun, Agent workbench, median of five | 434 ms  | 369 ms  | -15%   |
| WebAssembly in Bun, Board viewer, median of five    | 576 ms  | 494 ms  | -14%   |

The pool timing (`bun docs/design/wide-board-layout-fixtures/timing.ts 7`), the
base tree and the branch alternated, four runs each, at a load of 26.7 to
32.9, did not show the change. The sum of the 29 first renders was 12,682 to
14,527 ms before and 12,727 to 15,727 ms after. Agent workbench's first
render was 2,197 to 2,536 ms before and 2,062 to 2,842 ms after. The pool runs
solves on parallel workers, so at this load the scheduling of the workers
decides more than a 20% cut in Graphviz time does. This measurement must be
taken again on a quiet machine.

Each commit, built on its own, with the user instructions of one native replay
of the 25 calls. Every commit answered all 25 the same:

| Commit      | Change                                           | Instructions | Against the commit before |
| ----------- | ------------------------------------------------ | ------------ | ------------------------- |
| `b39ce7afa` | base                                             | 9.659 G      |                           |
| `f656e9157` | `reorder` sorts a rank in place of its passes    | 9.059 G      | -6.2%                     |
| `c66996c47` | `transpose` counts a pair both ways at once      | 7.921 G      | -12.6%                    |
| `d6ea9719a` | network simplex on a dense copy                  | 7.826 G      | -1.2%                     |
| `399e1fb7a` | routing finds orientations once, sorts triangles | 7.432 G      | -5.0%                     |
| `7673e7b6c` | `limit_boxes` reads only the samples it can use  | 7.255 G      | -2.4%                     |
| `db587cf0b` | `medians` sorts with the standard sort           | 7.179 G      | -1.0%                     |
| `1b616a63a` | network simplex on dot's graph again             | 7.274 G      | +1.3%                     |

The dense copy of network simplex (`d6ea9719a`) saved 1.2% of the
instructions. Its cycles, alternated twice with the commit before at a load of
36 to 41, were 2.7% lower once and 2.4% higher once. As WebAssembly in Bun,
alternated five times, its median was 1,007 ms against 997 ms before. It
copied and wrote back every field that network simplex touches, so
`1b616a63a` took it back.

### Each change

1. `reorder` sorts a rank in place of its passes (`mincross_rank.rs`,
   `RankCopy::sorted_by_segments`). Under `remincross`, with no flat edges and
   a median for every node, the passes of `reorder` are a bubble sort of each
   run of nodes between cluster borders, by median. A stable sort gives the
   same order. In the reverse pass, nodes of equal median also exchange, so
   each run of equal medians is rotated as the passes rotate it. Any other rank
   still runs the passes (`RankCopy::passes`). A test holds the sort equal to
   the passes on 20,000 random ranks.
2. `transpose` counts the crossings of a pair both ways in one pass over their
   edges (`mincross.rs`, `in_cross_both`, `out_cross_both`). The sums are of
   integers, so their order does not change them, and the sum of `out_cross`
   wraps as an `i32` as before.
3. Routing finds each orientation once and links triangles by sorting
   (`graphviz-pure-geom`, `triang.rs`, `shortest.rs`). `intersects` computed
   the same four `ccw` results more than once. `pshortestpath` compared each
   triangle with every other one to link those that share an edge. It now sorts
   the triangles' edges by their two points and links each edge to the
   largest other triangle that holds both points, as the old loop did.
4. `limit_boxes` reads, for each box, only the samples that can reach its rows
   (`routespl.rs`). The test of a sample against a box's rows depends only on
   the sample's y. So the samples that can pass it are one run of the samples
   ordered by y, which a binary search finds. The samples of that run are read
   in their old order.
5. `medians` sorts its integer positions with the standard sort, in place of
   the musl `qsort`. Equal integers cannot be told apart, so any sort gives the
   same array.

`crates/vendor/README.md` lists each changed file, and each change says
`archboard:` where it is. `crates/archboard-graphviz/tests/critical_graphs.rs`
holds the answer of one graph of each critical solve to its hash from the
base. A fault put in on purpose into the rotation of equal medians, the run
of samples, or the bubble sort's compare makes it fail. So did a fault in the
write-back of the network simplex copy, while the branch held it.

These experiments did not help, and were taken back:

- a copy of a rank's edges for each `transpose` step (15% more instructions)
- `NodeInfo` and `EdgeInfo` with their hot fields first (`repr(C)`, under 1%)
- crossing sums without branches (about 1%)
- the sort of `reorder` for ranks with fixed nodes (no gain on these graphs)
- a cheaper hash of the ranks in the repeat detection of `mincross` (0.2%)
- a static Leonardo table for `qsort` (0.1% natively, none as WebAssembly)
- a memo of the crossing counts of each pair inside one `transpose` (12.6%
  more instructions)
- a WebAssembly build with `simd128`, and `wasm-opt -O3` (no gain in Bun)
- network simplex on a dense copy of its fields (1.2% fewer instructions, no
  time that stood out from the noise)

### A typed port, measured and not built

The `Graphviz` port takes viz-js Graph JSON text and gives json0 text. A
native profile of the critical solves at the base put the text work at about
2.3% of the solve's CPU time: the graph's text 0.42%, reading it 0.35%, the
json0 writing 0.56% (`write_json`) and 0.75% (`emit_null`), and the layout's
reading of the answer 0.26%. That is about 11 to 12 ms of Board viewer's critical solve. After the changes,
the whole json0 render is 7.8% of Graphviz time, and a typed answer would
leave out only a part of that. A typed port changes the interface that
TASK-548.05 and TASK-548.06 work beside, and the memo of the layout's engine
keys its answers by the graph's text. So it was not built.

### Options that change answers, for the owner

Measured on the 25 calls of the two critical solves, natively, with the
branch's changes made so far, at a load of about 28. A changed answer is a
changed layout, so drawings change:

| Option                          | Time    | Answers changed, of 25 |
| ------------------------------- | ------- | ---------------------- |
| None                            | 886 ms  | none                   |
| `mclimit=1`                     | 588 ms  | 19                     |
| `mclimit=2`                     | 724 ms  | 15                     |
| `remincross=false`              | 670 ms  | 25                     |
| `mclimit=1`, `remincross=false` | 541 ms  | 25                     |
| `searchsize=10`                 | no gain | 25                     |

### The critical path against 500 ms

On the quieter machine where the base was first measured, the critical path
was 483 ms for Agent workbench (Graphviz 269 ms) and 545 ms for Board viewer
(Graphviz 374 ms). Under load, the branch took 101 ms off Agent workbench's
critical path and 105 ms off Board viewer's, about 14% to 15%. If the same
share holds on the quiet machine, Agent workbench comes to about 410 ms and
Board viewer to about 470 ms. That is an estimate from scaling, not a
measurement. A WebAssembly profile of the critical graphs still puts about 9%
of the time in the allocator (dlmalloc), and crossing reduction remains the
largest part of Graphviz time.
