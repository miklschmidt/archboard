---
id: TASK-500.02
title: Logging and thrown-value text are the diagnostics package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 01:59'
updated_date: '2026-10-19 02:12'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/diagnostics with package.json (name, private, type module, exports, imports #* and #tests/*), the same shape as packages/timing.
2. Sources: runtime/engine/logger.ts (winston, Node only) goes to src/runtime/services/logger.ts. shared/thrown-error/index.ts (errnoCode, errorMessage) goes to src/shared/rules/errno.ts. runtime/engine/lib/thrown-error.ts goes to src/shared/rules/thrown-error.ts. runtime/engine/lib/unknown-record.ts goes to src/shared/rules/unknown-record.ts. Keep both errorMessage behaviours; do not merge them.
3. exports: ./logger, ./errno, ./thrown-error, ./unknown-record. The browser imports only the three shared subpaths.
4. Move runtime/engine/tests/logger.test.ts to packages/diagnostics/tests/runtime/services/logger.test.ts.
5. Rewrite every importer (src, tests, scripts, frontend, tools, mock.module and dynamic imports) to @archboard/diagnostics/<subpath>. Write a reusable codemod at /tmp/pm/move-package.ts for the next package tasks.
6. Update docs/agents/boundaries.md only where it names the old paths. Run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved with /tmp/pm/move-package.ts (a map of old path to package, file and export subpath; it rewrites importers by resolving specifiers like the lint plugin). 50 files rewritten. Both errorMessage functions kept: ./errno says 'unknown error' for a non-Error non-string, ./thrown-error stringifies. No browser code imports the package today; the browser may import only ./errno, ./thrown-error and ./unknown-record.
<!-- SECTION:NOTES:END -->
