---
id: TASK-663.05
title: The code check flags a dependency the code calls
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A dependency means nothing of the target runs at run time. The code check reports, as information, a dependency whose evidence is a call into a function or value of the target (102 of the 157 anchored dependencies here cite one), so the agent states the call and its effect instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dependency whose anchor or evidence is a call into the target's function or value gets an information finding naming both ends
- [ ] #2 A type-only or build dependency gets none
<!-- AC:END -->
