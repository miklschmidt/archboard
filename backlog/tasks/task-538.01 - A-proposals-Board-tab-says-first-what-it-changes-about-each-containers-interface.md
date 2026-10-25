---
id: TASK-538.01
title: >-
  A proposal's Board tab says first what it changes about each container's
  interface
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - compare
  - ui
dependencies: []
parent_task_id: TASK-538
type: feature
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first slice of TASK-538. An interface change costs every caller, so ADR 0044 puts interface changes before other changes in a comparison. The CLI does so. The browser shows only counts of added, changed and removed subjects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a variant read against another, the Board tab lists each container whose interface changed: entry points added and removed, parts that moved between the interface and the hidden parts, and callers gained and lost
- [ ] #2 The list holds exactly the containers and parts that semantic compare lists as interface changes for the same two variants
- [ ] #3 The list stands after the summary and before the counts of the comparison
- [ ] #4 If no interface changed, the region says so, and the current variant shows no region
- [ ] #5 Choosing a row picks the part, pointing at a row lights it, and no comparison status changes
<!-- AC:END -->
