---
id: TASK-482.03
title: Live panes gets inner structure and its calls move into flows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 21:39'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft Live panes@TASK-482.03: four areas inside Archboard server, Pane connections, Board news, Pane places and Server plumbing, each holding the parts that the existing views already group; plus a Server plumbing view.
2. Show the owner the overview, the views and Everything.
3. Open questions for the owner: the areas have no folder to bind to (src/server/archboard/lib is flat); the overview draws 13 parts and 31 lines, over the 25-line budget.
4. After approval: settle bindings, make the overview fit the budget, run the code check and footprint, adopt.
Boards: Live panes (proposal Live panes@TASK-482.03).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Draft drawn at version 46: semantic compare reports 4 parts added and 16 parts changed in parent only; every relationship, flow and step is unchanged. Overview: 13 parts and 31 lines (Everything: 29 parts and 71 lines). The board has 71 relationships over 69 pairs, so moving calls into flows does not reduce it.
<!-- SECTION:NOTES:END -->
