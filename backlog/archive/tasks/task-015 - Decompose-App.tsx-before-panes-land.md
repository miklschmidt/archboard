---
id: TASK-015
title: Decompose App.tsx before panes land
status: To Do
assignee: []
created_date: '2026-08-19 16:51'
updated_date: '2026-08-19 16:59'
labels:
  - needs-triage
dependencies: []
ordinal: 15000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WebSocket handling, sync, selection, and board state are separable units
- [ ] #2 A second canvas instance can be mounted without duplicating that logic
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 16:59
---
Superseded by TASK-016 (build the archboard shell). The shell rebuilds the header and hosting layer, so fixing these separately would be work thrown away — they are acceptance criteria there instead.
---
<!-- COMMENTS:END -->
