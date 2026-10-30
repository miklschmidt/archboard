---
id: TASK-539.03
title: Exposed names list the uses by tests apart
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
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A test is never a caller (TASK-436.05), so test uses are left out of the outside users. But a name that only tests use is part of the question of whether the interface is too wide. Today the code pass reads only the imports of private files by tests, not their uses of exposed names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each exposed name lists the test files outside the module that use it, under a heading of their own, and they never count as outside users
- [ ] #2 A test inside the module is never listed
- [ ] #3 A test row lights nothing on the picture
<!-- AC:END -->
