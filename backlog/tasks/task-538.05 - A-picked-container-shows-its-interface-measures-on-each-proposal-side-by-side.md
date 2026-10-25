---
id: TASK-538.05
title: A picked container shows its interface measures on each proposal side by side
status: To Do
assignee: []
created_date: '2026-10-25T17:06:00Z'
labels:
  - compare
  - ui
dependencies:
  - TASK-538.01
parent_task_id: TASK-538
type: feature
ordinal: 946000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0044 allows the interface measures of competing proposals side by side, and semantic compare --beside answers them in the CLI. In the browser, a container shows the measures of the variant on screen only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A picked container shows one row for each variant of the board: current, each draft and each shelved variant, with the five interface measures
- [ ] #2 The numbers equal those of semantic compare --beside
- [ ] #3 The variant on screen is marked, a shelved row carries its reason, and a variant where the node holds no parts or draws no caller says so
- [ ] #4 Nothing is scored, ranked or highlighted as better
<!-- AC:END -->
