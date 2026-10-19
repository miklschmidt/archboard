---
id: TASK-500.23.03
title: Workbench runtime coordinator and workhorses
status: To Do
assignee: []
created_date: '2026-10-19 14:13'
labels: []
dependencies:
  - TASK-500.23.02
parent_task_id: TASK-500.23
ordinal: 896000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third move: codex-coordinator, codex-workhorse-operations, codex-coordinator-callbacks, codex-coordinator-tools, codex-spoken-approval and codex-workhorse-start. They import the foundation of 500.23.02 and each other (callbacks, tools and spoken approval import the coordinator). After this move no runtime/codex-* module that belongs to the workbench is left in src/runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench/src/runtime holds the six modules in role folders with api files, and no workbench runtime/codex-* module is left in src/runtime
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
