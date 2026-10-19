---
id: TASK-500.15
title: Shared presentation parts are the ui-kit package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 884000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ui-kit is layer 0 of docs/design/package-map.md: ui/components, dialog-parts, frame-clock, fullscreen-presentation, repository-name. workbench and code-opener draw with them, so they sit below both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/ui-kit holds the five ui modules in ui/ role folders (components, hooks, state) with api files, and every importer uses @archboard/ui-kit
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New package under packages/ with package.json (name, private, type module, version 0.0.0, BUSL-1.1, imports #* and #tests/*, exports only into src/<area>/api), created with curated api files from the start (docs/agents/boundaries.md api role). UI modules go under src/ui/ with role folders components, hooks, state (docs/design/package-map.md Target shape); the index.ts barrels of the old modules are deleted and importers rewritten by (old path, name) to the api interface, with a definition/alias/type check.
2. Move the tests with the code (packages/<name>/tests/ui/...). Fix every path that names the old modules: components.json (shadcn aliases), vite.config.ts, tsconfig, .oxlintrc*, docs, skills, ci.yml, evals/coverage.json, scripts. Tailwind class scanning must still see the moved components: compare the built stylesheet before and after.
3. Browser safety trace not needed for ui-only packages, but build:frontend must pass and the package graph and package api tests must pass (add each new package to the ADOPTERS list). bun run check.
<!-- SECTION:PLAN:END -->
