---
id: TASK-548.07
title: Graphviz lays out the critical solve's graphs faster, to the same bytes
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T10:51:00Z'
updated_date: '2026-10-27T23:33:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Graphviz is 56% of Agent workbench's critical solve and 69% of Board viewer's (native critical_path example on feat/faster-first-render: 269 of 482 ms and 372 of 541 ms). TASK-548.03 sped up the vendored graphviz-pure (crates/vendor, ADR 0058) to the same answers. The Graphviz port still passes a viz-js Graph JSON text in and json0 text out, and writing and reading that text is about 9.8% of a call. The owner's goal is real-time scene changes, with complex boards under 500 ms. Options that change drawings, such as mclimit=1 or remincross=false, are the owner's decision and are only reported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Graphviz time of the critical solves of Agent workbench and Board viewer falls, measured with the critical_path example before and after
- [x] #2 Every Graphviz answer is the same as before: the corpus is unchanged and a test compares answers
- [x] #3 crates/vendor/README.md lists every change made to the vendored crates
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Oracle: capture the critical solves of Agent workbench and Board viewer (critical_path example, out-of-repo harness), their 25 Graphviz (graph, answer) pairs, every Graphviz pair of their 19 solves, and reuse TASK-548.03's 2,106 corpus and timing pairs; record base answers of 3,361 corpus solves for a solve-level check.
2. Profile the critical graphs natively (perf) and as WebAssembly; measure wasm build options (simd128, wasm-opt) and answer-changing options (mclimit=1, remincross=false) for the owner.
3. Speed up the hot phases of graphviz-pure (mincross crossing counts, network simplex, routing, allocation) without changing any decision, tie or float order; check every change on all pairs natively and as wasm.
4. Measure a typed Graphviz port (no JSON text in or out); keep it only if the gain is worth the interface change and merges cleanly beside TASK-548.05/.06.
5. Record vendored changes in crates/vendor/README.md and results in docs/design/graphviz-pure-speed.md; add a test comparing answers.
6. Gates: corpus compare 0 of 2,344, timing.ts 7 alternated with b39ce7afa, cargo test, bun test packages/renderer, bun run check lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 progress (out-of-repo harness /tmp/548-07, oracle: TASK-548.03's 2,106 pairs + 163 distinct pairs of the 19 solves of the two first renders + 25 pairs of the two critical solves):
- Kept, each checked 0 differ on all pairs natively (and as WebAssembly at HEAD 7673e7b6c): reorder sorts cluster segments in place of its passes (property test vs the passes); transpose counts both crossing directions in one pass; network simplex on a dense copy; intersects finds orientations once and pshortestpath links triangles by sorting; limit_boxes reads only the y-run of samples that can reach a box; medians sorts integers with sort_unstable.
- Measured and taken back: dense per-step copy of a rank's edges for transpose (+15% instructions), repr(C) hot-field NodeInfo/EdgeInfo (<1%), branchless crossing sums (~1%), reorder chains with fixed nodes (no gain), cheaper repeat hash (0.2%), static Leonardo table for qsort (0.1%, none in wasm), a per-transpose memo of pair counts (+12% instructions), simd128 and wasm-opt -O3 builds (no gain in Bun).
- Answer-changing options on the 25 critical graphs (native replay, load ~28): base 886 ms; mclimit=1 588 ms, 19 of 25 layouts change; mclimit=2 724 ms, 15 change; remincross=false 670 ms, 25 change; both 541 ms, 25 change.

2026-10-26 results. Final HEAD is da3a6f016 and the base is b39ce7afa. The machine load was 24 to 41 on 24 threads throughout.

- Kept: `reorder` sorts cluster segments (f656e9157). `transpose` counts both directions in one pass (c66996c47). Routing finds orientations once and links triangles by sorting (399e1fb7a). `limit_boxes` reads only the y-run of samples (7673e7b6c). `medians` uses `sort_unstable` (db587cf0b).
- Taken back: the dense network simplex copy (d6ea9719a, reverted in 1b616a63a). It saved 1.2% of instructions. Its cycles moved by 2.5% either way across two alternations. Its WebAssembly median was 1,007 ms against 997 ms.
- AC#1, `critical_path` example: the base-tree binary and the branch (db587cf0b) ran alternated four times at load 24.5 to 26.9. Medians for Agent workbench: Graphviz 381 to 296 ms (-22%), critical path 679 to 578 ms. Medians for Board viewer: Graphviz 522 to 418 ms (-20%), critical path 757 to 652 ms. Both boards: 1,435 to 1,224 ms.
- Native instructions of the 25 critical calls at final HEAD: Agent workbench 4.010 to 3.037 G (-24%), Board viewer 5.648 to 4.237 G (-25%). WebAssembly in Bun, median of five alternations: Agent workbench 434 to 369 ms, Board viewer 576 to 494 ms.
- Pool timing (`timing.ts 7`, alternated four times each at load 26.7 to 32.9) did not resolve the change. The sum of 29 first renders was 12,682 to 14,527 ms before and 12,727 to 15,727 ms after. It must be taken again on a quiet machine.
- AC#2: the corpus render at final HEAD against the base gives 0 of 2,344 drawings differ. The oracle at final HEAD gives 0 differ of 2,106 + 223 + 25 pairs, natively and as WebAssembly.
- AC#2 test: `the_critical_graphs_get_the_answers_they_got_before` in crates/archboard-graphviz/tests/critical_graphs.rs. It holds one Agent workbench and one Board viewer critical graph to the FNV-1a hash of the base answer. Deliberate faults in the equal-median rotation, the sample run and the bubble compare make it fail.
- AC#3: item 4 of crates/vendor/README.md lists the changed files.
- Typed port: measured, not built. The text work was about 2.3% of the solve CPU at the base. The json0 render is 7.8% of Graphviz time after.
- The answer-changing options are measured and recorded in docs/design/graphviz-pure-speed.md for the owner.
- Vendored tests: core 68, geom 22, layout 100 and render 18 pass. Parser (5) and graphviz-pure (1) fail at the base too, because the crates.io archives do not ship their fixture folders.

Gate at a39e080a6, which only formats two Rust files after da3a6f016: `bun run check` passed every lane up to `test:repository`. There, one UI lint-policy test timed out at 15 s at load 45. Run again alone, `test:repository` passed 150 of 150. `test:serial-browser` passed 27 of 27. In the gate run, cargo workspace tests passed 186, `test:modules` passed 4,820 and `test:system` passed 257.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
graphviz-pure lays out the critical graphs faster to the same answers: reorder sorts cluster segments, transpose counts both directions in one pass, routing finds orientations once, limit_boxes reads only the run of samples it needs, and medians sorts with sort_unstable. Graphviz time of the critical solves fell 22% on Agent workbench and 20% on Board viewer (critical_path example, alternated four times). The corpus and 2,354 recorded Graphviz answers are unchanged, natively and as WebAssembly, and crates/archboard-graphviz/tests/critical_graphs.rs holds two critical graphs to their answers. crates/vendor/README.md item 4 lists the changed files. A typed port, simd128, wasm-opt and the dense network simplex were measured and not kept; the answer-changing options are recorded for the owner in docs/design/graphviz-pure-speed.md.
<!-- SECTION:FINAL_SUMMARY:END -->
