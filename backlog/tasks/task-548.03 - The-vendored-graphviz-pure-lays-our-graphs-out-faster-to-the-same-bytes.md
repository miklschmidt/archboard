---
id: TASK-548.03
title: The vendored graphviz-pure lays our graphs out faster, to the same bytes
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
