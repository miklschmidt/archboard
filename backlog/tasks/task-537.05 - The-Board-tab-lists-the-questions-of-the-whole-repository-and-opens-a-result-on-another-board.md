---
id: TASK-537.05
title: >-
  The Board tab lists the questions of the whole repository and opens a result
  on another board
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
labels:
  - design-questions
  - ui
dependencies:
  - TASK-537.04
parent_task_id: TASK-537
type: feature
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-537.01 lists the questions of the board on screen. The survey needs the whole repository, so the region reads the route of TASK-537.04 and can take the person to a result on another board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The region groups the questions of the repository by board and container
- [ ] #2 Choosing a result on another board opens that board in the pane and picks the subject
- [ ] #3 A board change updates the list without a reload
- [ ] #4 The region names the boards it read
<!-- AC:END -->
