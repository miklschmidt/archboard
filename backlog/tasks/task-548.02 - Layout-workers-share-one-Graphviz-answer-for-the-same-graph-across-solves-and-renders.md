---
id: TASK-548.02
title: >-
  Layout workers share one Graphviz answer for the same graph, across solves and
  renders
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T03:50:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design (chosen): each worker's core remembers Graphviz answers across solves, and the pool relays new answers to every other worker as they arrive.
1. Core (crates/archboard-renderer-wasm/src/layout.rs only; archboard-layout and archboard-graphviz untouched so 548.03/548.04 merge cleanly): the Graphviz port the binding hands lay_out_board consults a per-instance memory (graph text -> json0 answer, keyed by the full text, so it is exact) before calling archboard_graphviz::render. layOutBoard(graph, learned?) pushes each graph it laid out and its answer onto learned. New export rememberGraphvizAnswers(pairs) adds answers another worker laid out. Memory bounded in bytes (32 MiB, stated at the constant), oldest forgotten first; a forgotten graph is laid out again to the same answer, so eviction cannot change a drawing.
2. Worker (layout-engine.ts): passes an array to layOutBoard and replies { id, data|error, graphviz: pairs }; a { graphviz } message is applied in turn with the solves, so a solve sent after it finds those answers.
3. Pool (engine-pool.ts): remembers every pair a worker reports (same bound, oldest first), and posts the new ones at once to every other worker, and the whole memory to each worker it starts. Worker messages are FIFO, so any solve dispatched after an answer arrived finds every graph that answer laid out, on any worker. Solver port, ceiling, dispatch and call-off are unchanged.
Why this design: no SharedArrayBuffer and no synchronous wait; the alternative of sending a working set with each solve moves the same bytes but needs a choice of which answers a solve may need (the core cannot say in advance), and sending to the worker that holds the answers cannot cover parallel candidates on several workers. Broadcasting moves each answer once per worker, measured below against the CPU saved. Solves running at the same time cannot share (inherent without shared memory).
4. Tests: focused test that a re-render after a size-keeping relabel lays out no graph (owner of AC2), pool test that answers reach other and new workers, Rust unit test of the bound.
5. Measure: hits/misses and Graphviz CPU on timing.ts first renders (temporary instrumentation, not committed), timing.ts 7 alternating with 1db8eb36b twice each with uptime, the relabel and a size-changing edit, corpus compare against /tmp/t548/base.
6. Boards: proposals Renderer layout@TASK-548.02 and Semantic renderer@TASK-548.02 for the engine pool and the wasm binding, then adopt.
7. Gates: bun test packages/renderer, cargo test for archboard-renderer-wasm, type-check, lint, fmt:check, benchmark, browser-drawn-pictures and drawn-glyphs.
<!-- SECTION:PLAN:END -->
