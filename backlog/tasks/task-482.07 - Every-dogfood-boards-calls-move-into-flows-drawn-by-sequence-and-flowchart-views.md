---
id: TASK-482.07
title: >-
  Every dogfood board's calls move into flows, drawn by sequence and flowchart
  views
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-16 01:21'
updated_date: '2026-10-16 01:45'
labels: []
dependencies:
  - TASK-350
  - TASK-482.06
parent_task_id: TASK-482
priority: high
ordinal: 848000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0052 says a call is one exchange in an order and belongs to a flow, not to the architecture drawing. TASK-482.03 and TASK-482.04 carried this in their titles but closed with only the new structure: on 2026-10-16 the vault still held about 650 relationships of kind call and 21 flows, and Agent workbench had 41 calls and no flow. Views such as Voice on Agent workbench answer a sequence question with an architecture drawing that shows no lines. Flows written after TASK-350 can carry decisions and loops, so they are written once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every dogfood board answers its sequence questions with flows and sequence views, and its flows carry decisions and loops where the code branches or repeats
- [ ] #2 No architecture view of a dogfood board draws its parts without the lines that its question needs
- [ ] #3 archboard check and archboard check --code report nothing new against the boards before the move
- [ ] #4 Between two parts there is at most one relationship of each kind; each exchange that a board's question needs is a step of a flow, not a further relationship
- [ ] #5 Every board in the vault of github.com/Admin-By-Request/Docs-Architecture-Design meets the same criteria
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope widened by the owner on 2026-10-16: every board in every repository registered with archboard. On that day only two vaults held boards: this repository (17 boards, 674 call relationships, 15 flows) and github.com/Admin-By-Request/Docs-Architecture-Design at /home/msc/Work/Docs-Architecture-Design (22 boards, 53 call relationships, 1 flow). Every other registered checkout is either empty or a worktree of this repository. The archboard skill must teach when a question is an architecture view, a sequence view or a flowchart view; that rule lands with TASK-350.
<!-- SECTION:NOTES:END -->
