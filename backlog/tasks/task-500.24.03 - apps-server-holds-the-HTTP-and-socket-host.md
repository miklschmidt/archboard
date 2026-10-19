---
id: TASK-500.24.03
title: apps/server holds the HTTP and socket host
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.24.02
parent_task_id: TASK-500.24
ordinal: 904000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/server is the host: the rest of src/server/archboard and src/server.ts. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/server holds the host in area and role folders with its own tests; server-lifecycle spawns apps/server/src/server.ts, source staleness watches apps, and static files are served from dist/frontend without a synthetic moduleDir
- [ ] #2 System tests that start the server by path, the frontend-build staleness scan and the staleness test cover the app; startup failure, signals, shutdown, vault isolation, stale-source reporting and frontend serving tests pass; src/server and src/server.ts are gone
- [ ] #3 bun run check passes
<!-- AC:END -->
