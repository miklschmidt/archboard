---
id: TASK-500.23.02
title: 'Workbench runtime foundation: instructions, epoch, thread and approval modules'
status: To Do
assignee: []
created_date: '2026-10-19 14:13'
labels: []
dependencies:
  - TASK-500.23.01
parent_task_id: TASK-500.23
ordinal: 895000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second move. These runtime/codex-* modules depend on nothing above them: codex-instructions, codex-epoch, codex-wait-graph, codex-thread-link, codex-thread-unload, codex-thread-tools, codex-thread-context, codex-workhorse-queue, codex-coordinator-tool-contract, codex-approvals, codex-realtime and codex-dynamic-tools (about 35,000 lines with tests).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench/src/runtime holds those modules in role folders with api files, and runtime/codex-* of this list are gone from src/
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
