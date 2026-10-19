---
id: TASK-500.24
title: The three apps hold only what is left
status: To Do
assignee: []
created_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 893000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/web (the remaining ui modules: canvas, shell, catalog, pane session, walkthrough replay), apps/cli (cli/* and runtime/image-clipboard) and apps/server (the rest of server/archboard) are the layer 8 entry points. Apps are not imported by packages and import packages only through api files. frontend/main.tsx, bin/archboard, src/bin.ts, vite.config.ts, tsconfig paths and the test:serial-browser and CI paths need the new locations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/web, apps/cli and apps/server exist with their own tests folders, no package imports an app, and src/ holds no module any more
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
