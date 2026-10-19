---
id: TASK-500.03
title: Child process groups are the process package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 01:59'
updated_date: '2026-10-19 02:15'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cut the edge first, as its own commit: process-group-cleanup takes a generic error (failure: (message) => Error) instead of CodexProcessError; the Codex code supplies CodexProcessError. Keep every cleanup test passing.
2. packages/process, same package shape as timing and diagnostics (exports + imports #* and #tests/*). All process code is runtime-only (bun:ffi, node:fs, Subprocess), so everything goes under src/runtime/processes/: shared/process-observation (index, lib/frozen-group, lib/linux-stat), runtime/engine/process-group, runtime/engine/git-process-owner (a script that git-command spawns by file URL), runtime/engine/lib/git-group-termination, runtime/codex-process/lib/process-group and lib/process-group-cleanup. Drop the entry file codex-process/process-group.ts: importers use the package export directly.
3. exports: the minimum that code outside the package imports, found by grep. Include ./testing for the existing process-observation testing support. A file nobody outside imports stays private.
4. git-command.ts finds git-process-owner with new URL(..., import.meta.url). Resolve it from the package instead (import.meta.resolve of the export), and do the same in git-async.test.ts. Prove a git command still runs in its own process group.
5. Move the tests of the moved code: shared/process-observation/tests, engine/tests/git-group-termination.test.ts, codex-process/tests/process-group-*.test.ts. Keep the real-OS test.
6. Rewrite importers with /tmp/pm/move-package.ts, read the diff, fix what it cannot (URL forms). Update docs/agents/boundaries.md. bun run check.
<!-- SECTION:PLAN:END -->
