---
id: TASK-334
title: Two routes that cross where they turn get a bridge
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 575000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on Codex workhorse (2026-09-24): between Codex session and Epoch ledger two routes turn opposite ways on the same row and cross at their corners with no bridge, so a reader cannot follow either.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A crossing at or next to a bend is drawn with a bridge like any other crossing
- [ ] #2 One test owner fails without the fix
- [ ] #3 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->
