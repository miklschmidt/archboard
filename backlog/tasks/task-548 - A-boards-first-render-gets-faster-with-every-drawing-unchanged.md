---
id: TASK-548
title: A board's first render gets faster, with every drawing unchanged
status: To Do
assignee: []
created_date: '2026-10-26T02:26:00Z'
updated_date: '2026-10-26T03:57:00Z'
labels:
  - renderer
  - performance
dependencies: []
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A first render of a wide dogfood board takes 1.5 to 2 s (Agent workbench, Board viewer), above the 1 s layout budget of TASK-377. Measured on feat/rust-desktop-frontend: half of the solve CPU is Graphviz (viz-js, Emscripten) and half is the core's own layout, and a render waits on its longest chain of solves, so total CPU is not the bottleneck. Three spikes (local branches spike/graphviz-pure, spike/dugong, spike/wasm-threads; outputs in /tmp/spike-*) settled the direction: graphviz-pure, a pure-Rust port of Graphviz 16.1.0 patched to break sort ties as musl's qsort does, reproduces every corpus drawing byte for byte; dugong (dagre) is faster but draws clearly worse; a threaded WebAssembly core buys about 5% for unstable toolchain features, an unsafe allocator and cross-origin isolation, and the owner rejected it. 359 of the 1,072 Graphviz calls in the 23 first renders repeat a graph an earlier solve laid out, and a relabel that keeps card sizes re-rendered in 844 ms instead of about 1,600 ms with a shared cache. The owner chose to vendor the graphviz-pure crates into this repository rather than fork them on GitHub.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every drawing of the corpus (scripts/render-corpus.ts, current variants) is unchanged by the work
- [ ] #2 The first-render total of docs/design/wide-board-layout-fixtures/timing.ts falls measurably against feat/rust-desktop-frontend on the same machine, and docs/design records the before and after numbers
- [ ] #3 docs/design records the first render of the most complex boards (Agent workbench, Board viewer) against the owner's 500 ms target for real-time scene changes, and names what still stands between them and it
- [ ] #4 bun run benchmark passes
- [ ] #5 bun run check passes before the pull request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26: the owner set the goal: rendering fast enough for real-time scene changes, with complex boards' first render under 500 ms (today 1.6 to 1.8 s for Agent workbench and Board viewer). Get as close as possible; a win that would change drawings is reported for the owner to decide, not made.
<!-- SECTION:NOTES:END -->
