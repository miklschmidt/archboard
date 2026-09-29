---
id: TASK-367.16
title: sourcekit-lsp resolves Swift candidates
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.12
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 624000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sourcekit-lsp reads the index of a built Swift package. A package that has never been built has no index, and the check must say so instead of reporting false misses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Swift candidate in a Swift package resolves through sourcekit-lsp
- [ ] #2 A package without an index is reported once, and the candidates stay
<!-- AC:END -->
