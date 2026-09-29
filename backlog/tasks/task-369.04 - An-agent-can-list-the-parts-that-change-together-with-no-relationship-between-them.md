---
id: TASK-369.04
title: >-
  An agent can list the parts that change together with no relationship between
  them
status: To Do
assignee: []
created_date: '2026-09-29 01:19'
labels:
  - history
  - cli
dependencies:
  - TASK-369.03
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: feature
ordinal: 652000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two parts that change in the same commits depend on each other, whether or not the code shows it (Tornhill). When no relationship joins them on the board, that is a hidden dependency or one decision carried by two modules (Ousterhout's information leakage). The measurement in the design note shows both the signal and its trap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a board, the answer lists part pairs that meet the ADR's thresholds, with their shared commits and degree, and marks the pairs that no relationship joins
- [ ] #2 On Semantic renderer, the answer reproduces the painters measurement in the design note, or explains the difference by commits since
- [ ] #3 On Command interface, Claims and Panes are not reported, because their shared commits are sweeps
<!-- AC:END -->
