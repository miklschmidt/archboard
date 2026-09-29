---
id: TASK-367.08
title: Code facts for Python
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 616000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The second adapter makes the seam between the check and the languages real, and the skill evaluations run on Flask checkouts, which are Python.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Imports resolve for absolute, relative and package imports, including `__init__.py`
- [ ] #2 Definitions carry their visibility: listed in `__all__`, or not starting with `_`
- [ ] #3 The anchor, binding, undrawn and backwards checks work for parts bound to Python files
- [ ] #4 A small fixture package owns the behaviour in tests
<!-- AC:END -->
