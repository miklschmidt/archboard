---
id: TASK-500.02
title: Logging and thrown-value text are the diagnostics package
status: To Do
assignee: []
created_date: '2026-10-19 01:59'
labels: []
dependencies:
  - TASK-500.01
parent_task_id: TASK-500
ordinal: 867000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
diagnostics is layer 0 of docs/design/package-map.md. shared/thrown-error, runtime/engine/logger and runtime/engine/lib/thrown-error and unknown-record are used by nearly every layer, and engine holds them only by accident. Moving them into packages/diagnostics gives the layers above one import that carries no other engine code, and it is the second proof of the package shape after timing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/diagnostics holds the four sources in shared/ and runtime/ role folders, with an exports interface and no index.ts barrel, and every importer uses @archboard/diagnostics
- [ ] #2 The browser bundle imports only a subpath that holds no Node import
- [ ] #3 The tests of the moved code live in packages/diagnostics/tests and import their private files with # specifiers
- [ ] #4 bun run check passes
<!-- AC:END -->
