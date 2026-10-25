---
id: TASK-539.07
title: Exposed names for a card bound to a module
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - code-check
  - ui
dependencies:
  - TASK-539.02
parent_task_id: TASK-539
type: feature
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads the exposure of containers only. On the dogfood boards, the barrel files sit behind package cards on Archboard, so they never show. Reading cards adds work to every pass, so measure first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The time of a full code pass on the dogfood vault is measured before and after, and the notes record both
- [ ] #2 A picked card whose binding names a module shows its exposed names, with no interface finding
- [ ] #3 If the pass time grows by more than the owner accepts, the task stops and the notes say why
<!-- AC:END -->
