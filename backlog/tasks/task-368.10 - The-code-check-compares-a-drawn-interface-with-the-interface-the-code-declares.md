---
id: TASK-368.10
title: The code check compares a drawn interface with the interface the code declares
status: To Do
assignee: []
created_date: '2026-09-29 01:18'
labels:
  - interfaces
  - code-check
dependencies:
  - TASK-368.02
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 646000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The board says which children callers reach. The code says which names a module exposes: root files and package exports in TypeScript, `__all__` in Python, `public` in C#, `public` and `open` in Swift, public headers in C, C++ and Objective-C. The language adapters of TASK-367 give every definition its visibility. On 2026-09-29, 18 of the 40 names that the store's `index.ts` exports had no caller outside the store.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An entry point bound to a definition that the code does not expose is reported, because the board draws a caller that reaches past the interface
- [ ] #2 A hidden part bound to an exposed definition that an outside file uses is reported as a caller the board does not draw
- [ ] #3 Exposed names that nothing outside the module uses are reported as information, not as a warning
- [ ] #4 It works for TypeScript first, and for each language whose adapter gives visibility
<!-- AC:END -->
