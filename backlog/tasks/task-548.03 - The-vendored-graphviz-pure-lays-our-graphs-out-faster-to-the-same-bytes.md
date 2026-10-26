---
id: TASK-548.03
title: The vendored graphviz-pure lays our graphs out faster, to the same bytes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T03:55:00Z'
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
- [ ] #1 Every captured Graphviz graph of the corpus gets the same answer, byte for byte, as before the change
- [ ] #2 Every drawing of the corpus is unchanged
- [ ] #3 The Graphviz time of the first renders that timing.ts measures falls, and docs/design records where it went before and after
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
