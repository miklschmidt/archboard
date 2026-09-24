---
id: TASK-333
title: 'Relationships share a lane only when their kind, emphasis and traffic match'
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 574000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User decision 2026-09-24: relationships of one kind may share a lane on purpose (it reads cleaner than parallel lines, e.g. Archboard's 'register a checkout' and 'resolve code targets' into Repository checkout), but a difference in emphasis or traffic must give separate lanes too, not only a difference in kind. Seen on Codex workhorse: one lane comes down between Thread link and Codex session and forks into two arrowheads pointing opposite ways, with half a bridge at the fork.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two relationships that differ in kind, emphasis or traffic never share a lane
- [ ] #2 Relationships that match in all three still share a lane where they do today
- [ ] #3 One test owner fails without the fix
- [ ] #4 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->
