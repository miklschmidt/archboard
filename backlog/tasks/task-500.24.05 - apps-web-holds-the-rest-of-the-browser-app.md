---
id: TASK-500.24.05
title: apps/web holds the rest of the browser app
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.24.04
parent_task_id: TASK-500.24
ordinal: 906000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second web step: the remaining src/ui modules (application, shell, pane-session, board-routing, board-catalog, board-move, walkthrough-recording and replay, vault-diagnostics, types, theme), frontend/main.tsx, index.html, favicon and renderer-build.d.ts move into apps/web; vite.config.ts takes apps/web as root with output at dist/frontend; app.css and the WASM URL are rebased. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/web holds the whole browser app, vite.config.ts, tsconfig.frontend.json, components.json and the theme paths name the new locations, and the temporary #web/* entry is no longer used
- [ ] #2 The frontend build, the dev-mode stylesheet and Fast Refresh check and the full test:serial-browser lane pass
- [ ] #3 bun run check passes
<!-- AC:END -->
