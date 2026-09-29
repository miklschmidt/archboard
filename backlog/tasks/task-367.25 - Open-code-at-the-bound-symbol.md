---
id: TASK-367.25
title: Open code at the bound symbol
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
  - ui
dependencies:
  - TASK-367.06
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 633000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A binding with a symbol names more than a file, but Open code still opens the file at its top. Adding a field makes a promise to every reader of it (archboard-dev).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open code opens a local checkout at the line where the bound symbol is defined, when code facts find it
- [ ] #2 The GitHub target links to that line
- [ ] #3 Without a symbol, or when the symbol is not found, it opens the file as today
<!-- AC:END -->
