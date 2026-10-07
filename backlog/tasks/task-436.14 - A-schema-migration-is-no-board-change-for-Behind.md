---
id: TASK-436.14
title: A schema migration is no board change for Behind
status: To Do
assignee: []
created_date: '2026-10-07 00:37'
labels:
  - history
dependencies: []
parent_task_id: TASK-436
ordinal: 708000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Behind finds the last change of a board by comparing its current variant before and after each commit to the board file. If this build cannot read an old version, for example one in an older schema, it counts that commit as a change. So the commit that migrated the file becomes the last change, and the board reads as less behind than it is. ADR 0045 says that a migration write is no change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Behind decodes an old version of a board file with the migrations of the board store, and writes nothing
- [ ] #2 A commit that only migrated a board file is not its last change, with a test
<!-- AC:END -->
