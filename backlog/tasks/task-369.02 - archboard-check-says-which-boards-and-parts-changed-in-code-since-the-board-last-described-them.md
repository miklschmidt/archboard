---
id: TASK-369.02
title: >-
  archboard check says which boards and parts changed in code since the board
  last described them
status: To Do
assignee: []
created_date: '2026-09-29 01:18'
labels:
  - history
  - cli
dependencies:
  - TASK-369.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: high
type: feature
ordinal: 650000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of the history lens, and its cheapest reading. TASK-257 found 141 commits with no vault update. On 2026-09-29, Board viewer was 10 commits behind, 6 of them in `subjects.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each board, the check reports the commits to its bound files since the point the ADR chose, per board and per part
- [ ] #2 Parts that drill into another board are skipped, and a binding to a directory counts every file below it
- [ ] #3 Renamed files keep their history, and repositories this machine has not registered stay silent
- [ ] #4 The reading does not run inside the check that open canvases poll every 5 seconds
- [ ] #5 archboard-dev and `.archboard/README.md` tell a maintainer to read it
<!-- AC:END -->
