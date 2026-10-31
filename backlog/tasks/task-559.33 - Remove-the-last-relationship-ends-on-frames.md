---
id: TASK-559.33
title: Remove the last relationship ends on frames
status: To Do
assignee: []
created_date: '2026-10-31T20:03:00Z'
labels: []
dependencies: []
parent_task_id: TASK-559
ordinal: 1005000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner, on 2026-10-31: connections that reach a container header are always a bug or badly authored data. 335 relationships in 69 containers end on a module with parts. Each must end on the part that owns it, with no copied relationships and no import map.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No relationship ends on a module that has parts, apart from one that joins a module to a part it holds
- [ ] #2 archboard check fails on a relationship that ends on a module with parts
- [ ] #3 Relationship count does not rise
- [ ] #4 Measures recorded before and after
<!-- AC:END -->
