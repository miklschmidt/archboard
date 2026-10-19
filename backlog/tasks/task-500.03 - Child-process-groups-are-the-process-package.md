---
id: TASK-500.03
title: Child process groups are the process package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 01:59'
updated_date: '2026-10-19 02:33'
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
- [x] #1 process-group-cleanup no longer imports anything from codex-process process-contract, and the Codex code supplies its own error type
- [x] #2 packages/process holds the process-group, observation and group-termination code in role folders with an exports interface, and every importer uses @archboard/process
- [x] #3 The tests of the moved code live in packages/process/tests, including the real-OS process-group tests
- [x] #4 bun run check passes
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Step 1 done: group cleanup diagnostics.failure returns Error. Step 2: packages/process holds observation, group, git-owner, git-group-termination, codex-group, group-cleanup under runtime/processes. No ./testing export: the two testing.ts files only served tests that moved into the package, which import private files directly. process-group-freeze.test.ts stays in codex-process/tests: it drives createCodexProcessForTesting and the Codex test support, so moving it would make process depend on codex-process. The git owner script is found with import.meta.resolve('@archboard/process/git-owner').
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/process holds eight runtime files in runtime/processes (observation, frozen-group, linux-stat, group, git-owner, git-group-termination, codex-group, group-cleanup) behind six exports. The CodexProcessError edge is cut: group-cleanup takes a plain Error and the Codex code still supplies CodexProcessError. The git owner script is found with import.meta.resolve of @archboard/process/git-owner. process-group-freeze.test.ts stays in codex-process because it drives the Codex owner. The two testing.ts entry files were deleted because only the moved tests used them. bun run check passes. Codex review of 130686c05..81d80f67c found no defects. Advice kept for 500.04: the move codemod must report URL and filesystem strings instead of rewriting them, source-checkout.ts derives the repository root from its depth, and the language-server definitions must be split from path validation. No board is affected.
<!-- SECTION:FINAL_SUMMARY:END -->
