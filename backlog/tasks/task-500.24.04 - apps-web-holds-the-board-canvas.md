---
id: TASK-500.24.04
title: apps/web holds the board canvas
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 20:40'
labels: []
dependencies:
  - TASK-500.24.03
parent_task_id: TASK-500.24
ordinal: 905000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First of two web steps: src/ui/variant-lifecycle and src/ui/semantic-board-canvas (213 files, 40,000 lines) move into apps/web in role folders. Root src modules reach them through the temporary #web/* entry. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/web/src/ui holds the canvas and variant lifecycle in role folders with their tests, the canvas stays private to the app, and the importers still in src/ui use #web/*
- [ ] #2 Lint overrides for the canvas (frame clock, shadcn and others) are relocated and probed, Tailwind still generates the same classes, and the full test:serial-browser lane passes
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map the 213 canvas files and 7 variant-lifecycle files to role folders of apps/web/src/ui (components and hooks flat under semantic-board-canvas; lib split into rules, state and clients with sub-behaviors camera, walkthrough, drilling, board, picture, reads, subjects) and their 59 tests to apps/web/tests/ui/<role>/..., support to tests/ui/support/semantic-board-canvas.
2. Un-barrel every importer of the canvas hubs (index, drilling, lighting, timeline, tips, transitions) and of the variant-lifecycle index to the defining file, with a type-form check; delete the hubs.
3. git mv and rewrite specifiers: #ui/... and #tests/... inside the app, #web/... from root src/ modules and frontend/main.tsx.
4. Extend the lint plugin minimally so frontend/main.tsx may use the root #web/* entry, with a fixture test; drop the dead src canvas globs from the clock-rule override.
5. Add the apps ui folder to the Tailwind @source list and the README asset source lists; update evals owner strings, test-suite.md, boundaries.md (apps/web) and frontend.md.
6. Verify: tsc both configs, lint, fmt:check, bun test apps/web and src/ui, repository-policy, build:frontend CSS hash, dev server check, test:serial-browser, then bun run check.
<!-- SECTION:PLAN:END -->
