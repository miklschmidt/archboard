---
id: TASK-500.23.02
title: 'Workbench runtime foundation: instructions, epoch, thread and approval modules'
status: Done
assignee: []
created_date: '2026-10-19 14:13'
updated_date: '2026-10-19 15:06'
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
- [x] #1 packages/workbench/src/runtime holds those modules in role folders with api files, and runtime/codex-* of this list are gone from src/
- [x] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Unbarrel: rewrite each importer of the 11 codex-* barrels to the file that defines the name (inside) or to a curated api file (outside). 2. git mv the 195 files into packages/workbench/src/runtime/<role>/ and tests/runtime/. 3. Write runtime/api/ (10 files) and the exports. 4. Data files (instructions, manifests) found with import.meta.resolve of a # path. 5. Docs, assets.json, package.json capacity test paths, ADOPTERS. 6. tsc, lint, workbench tests, load, cycles, browser trace, bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The twelve runtime foundation modules (195 files) live in packages/workbench/src/runtime in role folders behind ten api files (163 names); old directories and barrels are gone. Codex reviewed 0c10f9348 with no findings (4,344 bindings compared, assets byte-identical, test counts preserved). bun run check exited 0.
<!-- SECTION:FINAL_SUMMARY:END -->
