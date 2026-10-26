---
id: TASK-548
title: A board's first render gets faster, with every drawing unchanged
status: To Do
assignee: []
created_date: '2026-10-26T02:26:00Z'
updated_date: '2026-10-26T02:30:00Z'
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
- [ ] #3 bun run benchmark passes
- [ ] #4 bun run check passes before the pull request
<!-- AC:END -->
