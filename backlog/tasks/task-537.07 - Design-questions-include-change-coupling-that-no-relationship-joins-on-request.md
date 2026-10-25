---
id: TASK-537.07
title: >-
  Design questions include change coupling that no relationship joins, on
  request
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - design-questions
dependencies:
  - TASK-537.05
parent_task_id: TASK-537
type: feature
ordinal: 941000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two parts that change together with no relationship between them point to a dependency that the board does not draw, or to one decision that two parts carry (ADR 0045, Ousterhout on information leakage). The history lens answers this per board. The survey needs it across the repository, read only when the person asks, because a Git walk has a cost.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The pane reads history only when the person asks, never on a timer and never on opening
- [ ] #2 Each unjoined pair names both parts, and choosing a pair lights both
- [ ] #3 archboard semantic questions --history, with an optional --since, gives the same pairs
- [ ] #4 The answer states its period, the large commits it left out and the parts it skipped
<!-- AC:END -->
