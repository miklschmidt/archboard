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
