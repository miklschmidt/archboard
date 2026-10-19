---
id: TASK-500.16
title: >-
  Every browser call to the server names its vault in the server-requests
  package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-19 11:40'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 885000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
server-requests is layer 0: ui/server-requests. CLAUDE.md invariant: every call to the server names its vault (ADR 0049), and the browser side of that rule lives here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/server-requests holds ui/server-requests with an api file, and every importer uses @archboard/server-requests
- [x] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New package under packages/ with package.json (name, private, type module, version 0.0.0, BUSL-1.1, imports #* and #tests/*, exports only into src/<area>/api), created with curated api files from the start (docs/agents/boundaries.md api role). UI modules go under src/ui/ with role folders components, hooks, state (docs/design/package-map.md Target shape); the index.ts barrels of the old modules are deleted and importers rewritten by (old path, name) to the api interface, with a definition/alias/type check.
2. Move the tests with the code (packages/<name>/tests/ui/...). Fix every path that names the old modules: components.json (shadcn aliases), vite.config.ts, tsconfig, .oxlintrc*, docs, skills, ci.yml, evals/coverage.json, scripts. Tailwind class scanning must still see the moved components: compare the built stylesheet before and after.
3. Browser safety trace not needed for ui-only packages, but build:frontend must pass and the package graph and package api tests must pass (add each new package to the ADOPTERS list). bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/server-requests holds the ui server-request helpers (244 lines) in ui/clients behind one api file, export '.', 10 names; all 10 outside importers were verified including the dynamic import. isRecord and trustReply had no outside caller and went private. bun run check passed and Codex found no defect in this package.
<!-- SECTION:FINAL_SUMMARY:END -->
