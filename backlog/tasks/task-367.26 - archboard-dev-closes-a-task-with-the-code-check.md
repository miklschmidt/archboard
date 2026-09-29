---
id: TASK-367.26
title: archboard-dev closes a task with the code check
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
  - skill
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: chore
ordinal: 634000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a task closes with a manual step: inspect each proposal against the code as built. The code check does most of that inspection. The step remains for what the check cannot see.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard-dev closing steps run `./bin/dogfood check --code --variant TASK-<n>` on each proposal before adoption
- [ ] #2 The manual evidence rules remain only for what the check does not cover, and the skill says which
<!-- AC:END -->
