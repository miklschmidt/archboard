---
id: TASK-617
title: The browser build works under any base path
status: To Do
assignee: []
created_date: '2026-11-09 01:20'
labels:
  - frontend
dependencies: []
references:
  - vite.config.ts
  - apps/web/src/ui/panes/reading-routing/components/ReadingRoutingHost.tsx
  - packages/renderer/src/ui/state/diagram-icons.ts
ordinal: 1063000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser build assumes that it is served at the root of its host. Absolute paths such as /assets/diagram-icons and a router without a base path break a copy of the build served under a sub-path, which is how static hosts such as GitHub Pages serve a project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The build uses a relative base, so every asset, worker and .wasm URL resolves against the page
- [ ] #2 The router and the icon URL follow the base of the document
- [ ] #3 The app that the local server serves at the root keeps working
- [ ] #4 One browser owner serves a build under a sub-path and draws a picture there
<!-- AC:END -->
