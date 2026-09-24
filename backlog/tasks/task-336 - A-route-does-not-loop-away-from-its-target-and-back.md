---
id: TASK-336
title: A route does not loop away from its target and back
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 577000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on Browser application (2026-09-24): the relationship 'restore through the workspace port' leaves Workspace routing downward and loops back up to Application composition instead of taking the short way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Browser application relationship takes a route without the loop
- [ ] #2 One test owner fails without the fix
- [ ] #3 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->
