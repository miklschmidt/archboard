---
id: TASK-548.02
title: >-
  Layout workers share one Graphviz answer for the same graph, across solves and
  renders
status: To Do
assignee: []
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T02:30:00Z'
labels:
  - renderer
  - performance
dependencies:
  - TASK-548.01
parent_task_id: TASK-548
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 23 first renders that timing.ts measures, 359 of 1,072 Graphviz calls lay out a graph that an earlier solve of the same render already laid out (2.2 s of 10.9 s Graphviz CPU). The core caches answers only within one solve, and each layout worker has its own memory, so repeats on other workers and in later renders are laid out again. The threaded-core spike (spike/wasm-threads, /tmp/spike-threads) showed that a cache shared by every solve and kept across renders re-renders Agent workbench after a relabel that keeps card sizes in 844 ms instead of about 1,600 ms. The owner rejected WebAssembly threads, so the cache must work with today's worker pool and without SharedArrayBuffer or cross-origin isolation. It is exact only once Graphviz runs in the core, whose answer depends on the graph alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Graphviz call for a graph that any earlier solve of the process laid out is answered from the shared cache, on any worker
- [ ] #2 A re-render after an edit that keeps every card's size lays out no graph again
- [ ] #3 The cache's memory is bounded, and the bound is stated where it is set
- [ ] #4 Every drawing of the corpus is unchanged
- [ ] #5 It works under Bun and in the browser without SharedArrayBuffer
- [ ] #6 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->
