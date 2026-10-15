---
id: TASK-482.03
title: Live panes gets inner structure and its calls move into flows
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 22:06'
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
- [x] #1 The Live panes overview stays within the budget, and `archboard check` reports no `OVERVIEW_CROWDED` for it
- [x] #2 Each container has a view that opens it, and the calls that the board needs are steps of flows drawn through sequence views
- [x] #3 The owner has looked at the overview, the views and Everything, and approved the result or named what to change
- [x] #4 Every new container has a responsibility that the code supports, and binds to a folder where the code has one
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

Owner decisions 2026-10-15: areas bind to a folder only where the code has one (src/server/archboard/lib is flat, so the Live panes areas are unbound; ADR 0052 amended); the overview no longer draws a line between a container and a part it holds. Splitting Pane connections measured 14 parts and 37 lines, so the owner chose to merge Pane places into it instead: the draft now has three areas and its overview draws 12 parts and 22 lines, inside the budget. The empty space in the track drawing is a layout defect under diagnosis, separate from the board.

Closing: archboard check --code reports the same findings with and without --variant TASK-482.03 (empty diff). Footprint against base 59d7a38d3: current is TASK-472.11, the parent; namedAndChanged and changedNotNamed are empty; namedNotChanged lists the 16 moved parts, because the task regroups the board and changes none of their code. Adopted at version 49 with the summary rewritten to the board scope. archboard check: no OVERVIEW_CROWDED for Live panes (13 boards remain, TASK-482.04). Views open each area: Pane connections and Moving a pane, Board news, Server plumbing. No relationship moved into a flow: the board keeps one relationship per pair (71 over 69 pairs), and its two flows already draw the exchanges it needs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Live panes now groups the server parts into three unbound areas, Pane connections, Board news and Server plumbing, each opened by a view. Its overview draws 12 parts and 22 lines instead of 25 and 69, inside the budget. The owner looked at the draft in the browser and approved it. Verified with archboard check, the code-check comparison and the footprint.
<!-- SECTION:FINAL_SUMMARY:END -->
