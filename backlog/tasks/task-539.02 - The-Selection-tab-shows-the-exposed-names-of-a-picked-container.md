---
id: TASK-539.02
title: The Selection tab shows the exposed names of a picked container
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
labels:
  - code-check
  - ui
dependencies:
  - TASK-539.01
parent_task_id: TASK-539
type: feature
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The person-facing half of TASK-539. A container whose binding names a module shows what its code exposes, most used first, so an interface that is too wide shows without opening the code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A picked container whose binding names a module shows an Exposed names region with the count of exposed names and of names used outside
- [ ] #2 Names are listed most used first, and names with no outside use collapse into one row that opens
- [ ] #3 Choosing a name lists its users as paths, and the files that pass it on as via lines
- [ ] #4 Pointing at a user lights the drawn part that holds it, and a user that no part of the board holds says Not drawn
- [ ] #5 The region shows when the pass ran, and says so when no pass has run, when the board changed after the pass, when the variant was not read, or when the container was skipped
- [ ] #6 A card, or a container whose binding names no module, shows no region
- [ ] #7 The picture does not change
<!-- AC:END -->
