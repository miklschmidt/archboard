---
id: TASK-548.07
title: Graphviz lays out the critical solve's graphs faster, to the same bytes
status: To Do
assignee: []
created_date: '2026-10-26T10:51:00Z'
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
- [ ] #1 Graphviz time of the critical solves of Agent workbench and Board viewer falls, measured with the critical_path example before and after
- [ ] #2 Every Graphviz answer is the same as before: the corpus is unchanged and a test compares answers
- [ ] #3 crates/vendor/README.md lists every change made to the vendored crates
<!-- AC:END -->
