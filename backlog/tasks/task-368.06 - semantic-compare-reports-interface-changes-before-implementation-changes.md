---
id: TASK-368.06
title: semantic compare reports interface changes before implementation changes
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - cli
  - skill
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 642000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An interface change costs every caller, and an implementation change costs one module. Today a comparison lists every changed subject at the same level, so the change a reviewer must weigh first is mixed with the rest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each container, the comparison reports entry points added and removed, parts that moved between the interface and the hidden parts, and callers gained and lost
- [ ] #2 The interface changes come before the other changes in the human answer, and have their own place in the machine-readable answer
- [ ] #3 The propose-and-compare recipe of the consumer skill shows the interface section
<!-- AC:END -->
