---
id: TASK-436.04
title: >-
  The 36 relationships that end on a private file of a module move to entry
  points
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - dogfood
dependencies: []
parent_task_id: TASK-436
ordinal: 698000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-368.05 moved relationships from outside a module that end on a part bound to a private file of that module, but only on boards with no containers. 36 remain: Board rasterizer 12, Agent workbench 8, Voice coordinator 7, Board viewer 6 and Codex session 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the 36 relationships ends on an entry point of its module, or the notes say why the code really uses the private file
- [ ] #2 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->
