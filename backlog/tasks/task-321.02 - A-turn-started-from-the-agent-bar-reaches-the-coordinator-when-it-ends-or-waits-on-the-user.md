---
id: TASK-321.02
title: >-
  A turn started from the agent bar reaches the coordinator when it ends or
  waits on the user
status: To Do
assignee: []
created_date: '2026-09-23 23:38'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-321
priority: high
type: feature
ordinal: 558000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second slice of TASK-321: today only work the coordinator handed the workhorse is reported. A turn the user started from the agent bar, even one the voice steered, is never reported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While voice is live, a workhorse turn the agent bar started reaches the coordinator when it ends or when it waits on the user, the same way the coordinator's own work does
- [ ] #2 One owner proves an agent-bar turn's end reaches the coordinator
<!-- AC:END -->
