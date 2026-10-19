---
id: TASK-500.05
title: A node binding and its checkout resolution are the code-binding package
status: To Do
assignee: []
created_date: '2026-10-19 01:59'
labels: []
dependencies:
  - TASK-500.04
parent_task_id: TASK-500
ordinal: 870000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
code-binding is layer 3 of docs/design/package-map.md: shared/code-target and runtime/code-target. It keeps the binding, anchor and document-reference schemas, because board will import them and the resolver parses with CodeBindingSchema. After this task runtime/engine holds only the board files and the server-lifecycle files that later tasks move.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/code-binding holds shared/code-target and runtime/code-target in role folders with an exports interface, and every importer uses @archboard/code-binding
- [ ] #2 The tests of the moved code live in packages/code-binding/tests
- [ ] #3 bun run check passes
<!-- AC:END -->
