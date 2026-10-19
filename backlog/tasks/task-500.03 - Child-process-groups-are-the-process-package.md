---
id: TASK-500.03
title: Child process groups are the process package
status: To Do
assignee: []
created_date: '2026-10-19 01:59'
labels: []
dependencies:
  - TASK-500.02
parent_task_id: TASK-500
ordinal: 868000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
process is layer 1 of docs/design/package-map.md: shared/process-observation, runtime/engine process-group, git-process-owner and git-group-termination, and the codex-process group files (process-group, process-group-cleanup) own a child process group and end it. Today process-group-cleanup imports CodexProcessError from codex-process process-contract, which would make process depend on codex-app-server. The cleanup must take a generic error type first, so the edge is cut before the move.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 process-group-cleanup no longer imports anything from codex-process process-contract, and the Codex code supplies its own error type
- [ ] #2 packages/process holds the process-group, observation and group-termination code in role folders with an exports interface, and every importer uses @archboard/process
- [ ] #3 The tests of the moved code live in packages/process/tests, including the real-OS process-group tests
- [ ] #4 bun run check passes
<!-- AC:END -->
