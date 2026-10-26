---
id: TASK-548.03
title: The vendored graphviz-pure lays our graphs out faster, to the same bytes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T06:24:00Z'
labels:
  - renderer
  - performance
dependencies:
  - TASK-548.01
parent_task_id: TASK-548
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
graphviz-pure is a faithful port and its author optimized for exactness, not speed. On the 1,072 Graphviz calls of the 23 first renders it takes 9.5 s natively and 11.9 s as WebAssembly (spike/graphviz-pure, /tmp/spike-gvpure): about 10 s layout (mostly crossing reduction; a software fma was 15.6% before the spike's fast fma), 0.7 to 1.1 s json0 output and 0.7 s DOT parsing. Any change must keep every answer byte for byte, including the musl tie order, so the captured graph and answer pairs and the corpus are an exact oracle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every captured Graphviz graph of the corpus gets the same answer, byte for byte, as before the change
- [x] #2 Every drawing of the corpus is unchanged
- [x] #3 The Graphviz time of the first renders that timing.ts measures falls, and docs/design records where it went before and after
- [ ] #4 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Oracle: capture every solve the Bun layout worker receives over the corpus (render-corpus current variants, both engines) and the timing.ts first renders, through a temporary uncommitted worker patch; replay the solves through an out-of-repo harness (native and wasm-bindgen) with a recording Graphviz to get every (graph, answer) pair; check native and wasm captures agree and that solve answers equal the product's.
2. Baseline: replay timing pairs natively, as wasm under Bun (JSC) and Node (V8).
3. Profile natively with perf; find hot spots in mincross, ns, splines, DOT parse, json0, JSON->DOT.
4. Optimise hot spots without changing decision order, tie order or float evaluation order; check every change against the oracle natively and as wasm.
5. Record vendored changes in crates/vendor/README.md; write docs/design profile note linked from layout-rules.md or ADR 0058.
6. Checks: oracle byte-identity, corpus compare 0 changed, timing.ts 7 alternating with base, bun test packages/renderer, cargo test, type-check, lint, fmt:check, benchmark.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions and evidence (details in docs/design/graphviz-pure-speed.md):

- Oracle: a temporary, uncommitted patch of `packages/renderer/src/runtime/processes/layout-worker.ts` recorded every solve over the corpus (current variants, both engines) and the `timing.ts 7` first renders. A replay program outside the repository ran them through `archboard-graphviz`, natively and as WebAssembly. That gave 2,106 distinct graph and answer pairs, and 1,072 of them are the timing set. The patch was reverted before the commits.
- Every commit was checked against all 2,106 pairs, natively and as WebAssembly: 0 differ.
- Kept changes:
  - mincross detects a repeated iteration and plays the rest out on recorded crossings
  - reorder stops early and works on a one-array rank copy
  - limit_boxes and ccw compute fused results only where they decide
  - fmt_g prints certain fixed digits directly
  - Statements replace the DOT text
  - spline ends are formatted only for -v
- Measured and taken back:
  - period-2 reorder detection
  - rank-end copies at each transpose step (slower, 7.45 s to 9.5 s)
  - a Fenwick tree for rcross
  - whole-pass cycle detection
  - tie-rotation repeat moves
  - a transpose memo
- A graph whose JSON holds a backslash or a character at or above U+10FF00 still goes through DOT text. The Statements path equals parse_dot on all 2,106 graphs and in the unit test `the_statements_make_the_graph_their_dot_text_reads_as`.
- Waiver for defect fixes: not used. No drawing changed.
- Not done, for the owner:
  - a typed Graphviz port answer: json0 is 9.8% of a call, and TASK-548.02 keys its cache by the text
  - a faster WebAssembly allocator: dlmalloc takes about 9%, in a crate that TASK-548.02 owns
  - mclimit=1: 21% less Graphviz time, but 602 of 1,072 answers change
  - remincross=false: 17% less, but 626 answers change
- Vendored crate tests outside the checkout: core 68, geom 22, layout 99, render 18 pass. Six tests fail at base and after alike, because the crates.io archives lack upstream's tests/fixtures and tests/wild folders: 5 in graphviz-pure-parser and 1 in graphviz-pure.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
graphviz-pure gives every captured graph the same answer, byte for byte, in about a third less time. Six commits change mincross, routing, fmt_g, the parser entry and the spline-end messages, and docs/design/graphviz-pure-speed.md records the evidence.

Results:

- Oracle: all 2,106 captured pairs are byte-identical, natively and as WebAssembly, after every commit.
- Corpus: `render-corpus.ts compare` reports 0 of 2,344 drawings changed.
- Graphviz replay of the 1,072 timing calls: WebAssembly in Bun took 7.2 s against 11.0 s. Native took 6.6 s against 9.2 s.
- `timing.ts 7`, alternated with base 1db8eb36b: the 23 first renders took 8,559 and 8,645 ms against 10,556 and 10,601 ms. Agent workbench took 1,359 and 1,398 ms against 1,669 and 1,680 ms.
- Board viewer's critical path still spends 621 ms in Graphviz, on 16 distinct graphs of 162 nodes. So Graphviz alone cannot bring it under 500 ms.

Gates: `bun test packages/renderer` 649 pass, `cargo test -p archboard-graphviz` passes, and type-check, lint, fmt:check and benchmark pass.

Open: six tests of the vendored crates need upstream fixture folders that the crates.io archives lack, and they fail at base too. So criterion 4 waits for the owner. The owner also decides on a typed port answer, a WebAssembly allocator, and mclimit=1, which changes drawings.
<!-- SECTION:FINAL_SUMMARY:END -->
