---
id: TASK-369.06
title: archboard-dev sets a task's footprint against its proposal at close
status: To Do
assignee: []
created_date: '2026-09-29 01:19'
labels:
  - history
  - skill
dependencies:
  - TASK-369.02
  - TASK-369.05
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: chore
ordinal: 654000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a task closes, archboard-dev inspects each proposal against the code as built. The footprint shows at once which changed parts the proposal did not name, and which named parts the task never changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard-dev closing steps read the footprint of the task's commits against each proposal before adoption
- [ ] #2 A changed part that no proposal names is either added to a proposal or explained in the task notes
<!-- AC:END -->
