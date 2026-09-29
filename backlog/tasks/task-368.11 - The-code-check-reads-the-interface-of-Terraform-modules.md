---
id: TASK-368.11
title: The code check reads the interface of Terraform modules
status: To Do
assignee: []
created_date: '2026-09-29 01:18'
labels:
  - interfaces
  - code-check
dependencies:
  - TASK-368.10
  - TASK-367.17
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: feature
ordinal: 647000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Terraform module's variables and outputs are its interface. A module that wraps one resource and passes each argument through as its own variable is Ousterhout's shallow module, and each such variable is his pass-through variable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A module's variables and outputs are reported as its interface
- [ ] #2 A variable passed unchanged to one resource argument is reported as a pass-through variable, and a module that wraps one resource is reported as shallow, both as information
<!-- AC:END -->
