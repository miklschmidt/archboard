---
id: TASK-500.13
title: The semantic context is in the codex-app-server package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 04:29'
updated_date: '2026-10-19 05:41'
labels: []
dependencies:
  - TASK-500.12
parent_task_id: TASK-500
ordinal: 878000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/codex-semantic-context (3,441 lines) belongs to codex-app-server in the map but imports board schemas by value (normalize-architecture.ts), so it waited for the board package. It moves in now, with the exports its importers need.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 codex-semantic-context lives in packages/codex-app-server in runtime/ role folders, every importer uses the package exports, and the package imports board only through @archboard/board
- [x] #2 The tests of the moved code live in packages/codex-app-server/tests, and the package graph test passes (codex-app-server is layer 5, board layer 4)
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move runtime/codex-semantic-context (index.ts barrel, 10 lib files, 7 tests) into packages/codex-app-server/src/runtime/ role folders from content (operations for the publisher, schemas for the brief and architecture types, services for limits and diagnostics). Delete the index.ts barrel and point importers at the defining files (unbarrel script /tmp/pm/board/unbarrel.ts is the example).
2. The package imports board by @archboard/board/... subpaths (layer 4 < 5) and nothing from src/. The package graph test must pass.
3. exports: the minimum used outside. Tests move to packages/codex-app-server/tests/runtime/<role>/. Update ci.yml, evals/coverage.json, docs, skills, boundaries.md. bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
runtime/codex-semantic-context is in packages/codex-app-server under operations (publisher), schemas (brief, context and architecture input, types) and services (limits, fit, slots, listener diagnostics, bounded text); the barrel is deleted and three exports were added (17 in total). The package imports board by @archboard/board subpaths; the package graph test passes. A fit and slots import cycle was broken by moving four types into the slots file. Codex verified all 63 former barrel names, renamed files identical apart from imports, and no browser path into the moved modules. bun run check passed. No defects found.
<!-- SECTION:FINAL_SUMMARY:END -->
