---
id: TASK-367.15
title: 'clangd resolves C, C++ and Objective-C candidates'
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.09
  - TASK-367.10
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 623000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
clangd needs `compile_commands.json` to know the include paths and flags of each file. Without it, clangd guesses, and a guess is no better than a candidate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A C, C++ or Objective-C candidate resolves through clangd when the checkout has `compile_commands.json`
- [ ] #2 Without `compile_commands.json`, the check says so once and reports candidates
<!-- AC:END -->
