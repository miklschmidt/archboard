---
id: TASK-482.03
title: Live panes gets inner structure and its calls move into flows
status: To Do
assignee: []
created_date: '2026-10-15 21:05'
labels:
  - skill
dependencies:
  - TASK-482.01
  - TASK-482.02
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: task
ordinal: 844000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pilot of ADR 0052. Live panes is the board the owner called incomprehensible: 25 parts directly in one container and 71 relationships, 47 of them calls. Its result shows the owner whether the overview, the structure and the flows read well before the other boards change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Live panes overview stays within the budget, and `archboard check` reports no `OVERVIEW_CROWDED` for it
- [ ] #2 Every new container has a responsibility and a binding that the code supports
- [ ] #3 Each container has a view that opens it, and the calls that the board needs are steps of flows drawn through sequence views
- [ ] #4 The owner has looked at the overview, the views and Everything, and approved the result or named what to change
<!-- AC:END -->
