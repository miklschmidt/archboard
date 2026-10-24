---
id: TASK-520.02
title: >-
  A Rust orthogonal router routes the trunks of Blocks, and libavoid leaves the
  renderer
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
labels:
  - renderer
  - performance
dependencies:
  - TASK-520.01
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-paint-list.md
parent_task_id: TASK-520
priority: high
ordinal: 922000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
libavoid takes most of the time of a Blocks render. Its unifying nudging prepass spends tens of seconds on dense boards (TASK-512), and its nudging solver signals an unsatisfiable constraint set with a C++ exception, hundreds of thousands of times in one slow solve (docs/design/layout-rules.md). libavoid is LGPL-2.1-or-later. A port of its source would make the core a derived work, so ADR 0057 requires a router written from the published algorithms of orthogonal connector routing and nudging. Output of libavoid-js may be compared as a black box. Nobody who writes the router reads the libavoid source. The router is judged by the measures of ADR 0039, not by equality with libavoid.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Blocks routes every trunk with the router of the core, and libavoid-js and its patch are gone from the repository
- [ ] #2 No corpus picture is worse on the measures of ADR 0039 than with libavoid, and the task notes record each reviewed difference
- [ ] #3 The corpus renders faster in total and no board renders slower, measured with the same harness before and after, with the numbers in the task notes
- [ ] #4 A trunk that the router cannot route keeps the dogleg fallback of today, and an unsatisfiable constraint set never throws
- [ ] #5 The router module cites the published algorithms it implements
<!-- AC:END -->
