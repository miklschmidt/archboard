---
id: TASK-500.23.04
title: 'Workbench server: server/codex-workbench'
status: To Do
assignee: []
created_date: '2026-10-19 14:14'
labels: []
dependencies:
  - TASK-500.23.03
parent_task_id: TASK-500.23
ordinal: 897000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fourth move: server/codex-workbench (11,500 lines): the routes, sessions and lifecycle that run the Codex workbench in the server. It imports the runtime and shared modules of the earlier moves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench/src/server holds server/codex-workbench in role folders with an api file that the server wiring uses, and server/codex-workbench is gone
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
