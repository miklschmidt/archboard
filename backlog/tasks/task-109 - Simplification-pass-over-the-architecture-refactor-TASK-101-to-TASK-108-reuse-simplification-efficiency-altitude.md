---
id: TASK-109
title: >-
  Simplification pass over the architecture refactor (TASK-101 to TASK-108):
  reuse, simplification, efficiency, altitude
status: To Do
assignee: []
created_date: '2026-08-23 19:34'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A four-angle review (reuse, simplification, efficiency, altitude) of `git diff b24eaf0..ccc9049` — the commits that landed TASK-101 (change-reporting reducer), TASK-103 (board version), TASK-104 (element input conversion), TASK-102 (board write door), TASK-106 (refusals carry the board), TASK-105 (naming sweep), TASK-107/108 (metadata reader, check-labels) — found the findings recorded on the two subtasks, split by file ownership so they can be fixed in parallel: the frontend half (reducer, hook, api.ts, its headless check) and the server/core half. None is a correctness bug; each is duplicated, wasted, dead, or a special case layered on the new shared mechanism. Fix without changing intended behaviour; every check keeps asserting what it asserts today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both subtasks are Done and `bun run test` passes on the combined tree
<!-- AC:END -->
