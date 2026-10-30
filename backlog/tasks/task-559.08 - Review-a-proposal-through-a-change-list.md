---
id: TASK-559.08
title: Review a proposal through a change list
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
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
- [ ] #1 A change list in the left column groups changes by owner, and `N` and `P` walk it
- [ ] #2 A change to a step opens that flow, and a reparented module shows its old and new parents
- [ ] #3 Removed subjects stay reachable, and the walk keeps its place by subject identity when the list changes
- [ ] #4 The owner walks a draft of 49 changes and accepts it by eye
<!-- AC:END -->
