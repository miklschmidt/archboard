---
id: TASK-559.08
title: Review a proposal through a change list
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-10-31T02:43:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.04
  - TASK-559.05
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 980000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most changes in a proposal are flow steps, which have no tree row. A reader needs to walk every change, across grammars, and reach removed subjects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A change list in the left column groups changes by owner, and `N` and `P` walk it
- [x] #2 A change to a step opens that flow, and a reparented module shows its old and new parents
- [x] #3 Removed subjects stay reachable, and the walk keeps its place by subject identity when the list changes
- [ ] #4 The owner walks a draft of 49 changes and accepts it by eye
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged from feat/reader-change-list at a0608dd30. The full gate passed on the merge in 157 seconds, 21 of 21. A draft opens on Changes. Criterion 4 waits for the owner's walk.
<!-- SECTION:NOTES:END -->
