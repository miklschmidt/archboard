---
id: TASK-548
title: A board's first render gets fast enough for real-time scene changes
status: To Do
assignee: []
created_date: '2026-10-26T02:26:00Z'
updated_date: '2026-10-26T17:03:00Z'
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
- [ ] #1 Every drawing the work changes is judged by the grading council (TASK-548.09) to read as well or better, and no change the council judges worse lands
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26: the owner set the goal: rendering fast enough for real-time scene changes, with complex boards' first render under 500 ms (today 1.6 to 1.8 s for Agent workbench and Board viewer). Get as close as possible; a win that would change drawings is reported for the owner to decide, not made.

2026-10-26: the owner waived byte-for-byte drawings where a performance change uncovers and fixes a defect (missed arcs, arrows through cards and the like). Each changed drawing needs evidence that a defect went away and that nothing got worse, listed in the task notes; any other change is reported for the owner to decide.

2026-10-26: rebased onto origin/main (aa364ad76), whose rewritten history holds its own ADR 0057 (render recipe) and ADR 0058 (interface width). The branch's ADRs became ADR 0059 (the renderer is a Rust core) and ADR 0060 (the vendored graphviz-pure). Task notes written before the rebase still cite them as 0057 and 0058.

2026-10-26: the owner dropped byte-identical drawings as the bar. A council of graders (Opus, gpt-6.1-sol and gpt-6-astra), each with criteria of its own and blind to the old scorecard metrics, decides whether a changed drawing reads better or worse. The owner also asked for out-of-the-box work: layout moved into the Graphviz crates if that pays, and deterministic heuristics in place of parallel solves that lay a board several ways to pick the best.
<!-- SECTION:NOTES:END -->
