---
id: TASK-436.15
title: 'Code facts record whether a definition is a function, a class or a value'
status: To Do
assignee: []
created_date: '2026-10-07 00:37'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 709000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A definition in code facts records its name, its lines and its visibility, but not its kind. So the code check cannot tell a handler that code passes to a framework, which runs, from a constant passed in the same way. That is why a use as a value never makes `RELATIONSHIP_UNDRAWN` (TASK-367.28).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each language adapter records whether each definition is a function, a class or a value
- [ ] #2 A function that code passes as an argument counts as a call for `RELATIONSHIP_UNDRAWN`, and a constant passed in the same way does not
- [ ] #3 The notes count the new warnings on the dogfood vault, and each one is drawn or explained
<!-- AC:END -->
