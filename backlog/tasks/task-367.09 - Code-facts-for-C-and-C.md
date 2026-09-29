---
id: TASK-367.09
title: Code facts for C and C++
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
ordinal: 617000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In C and C++, a dependency is an include, and what an include names depends on the include paths of the build. A part is often bound to a source file while its interface is in a header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `#include` resolves through `compile_commands.json` when the checkout has one, and through relative paths and configured include directories when it has none
- [ ] #2 Definitions carry their visibility: declared in a public header, or `static` and anonymous-namespace names that are internal
- [ ] #3 A part bound to a header or to its source file finds the definitions of the pair
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to C and C++ files
<!-- AC:END -->
