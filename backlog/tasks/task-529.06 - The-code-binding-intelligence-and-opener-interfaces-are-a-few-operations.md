---
id: TASK-529.06
title: The code binding, intelligence and opener interfaces are a few operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the code-binding, code-intel and code-opener package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [ ] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->
