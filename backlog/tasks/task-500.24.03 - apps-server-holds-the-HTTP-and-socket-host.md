---
id: TASK-500.24.03
title: apps/server holds the HTTP and socket host
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 19:59'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Unbarrel src/server/archboard/index.ts and the code-check, footprint and locality flat files: tests and the entry import the route and application files directly.
2. Move src/server.ts and the 34 lib files to apps/server/src/{server.ts,server/<role>/<behavior>/} with /tmp/pm/srv/move-app.ts: wiring (application, http, owners), lifecycle (lifetime, startup, resources), middleware, services, state, projections, watchers, sockets, rules, protocol, routes (code-check, footprint, locality, panes, repositories, semantic-boards, service). Tests go to apps/server/tests/server/ mirroring the roles; application-lifetime-terminal-stop moves in from tests/system.
3. Serve static files from SOURCE_CHECKOUT/dist/frontend (apps/server store/frontend) and drop moduleDir from the workbench host.
4. server-lifecycle spawns apps/server/src/server.ts, staleness watches src, packages and apps, and the startup remedy names the new path.
5. System tests: literal entry paths updated; the Codex production server, initial send failure and HTTP failure fixtures become bun --preload scripts run before the real entry (startOwnedServer gains preload); staleness-source touches an app file; the frontend-build scan includes apps.
6. package.json scripts, .oxlintrc.jsonc, lint plugin entry list, skills processes, evals/coverage.json, docs/readme/assets.json, boundaries.md, test-suite.md, TESTING.md, INSTALL.md, AGENTS.md and the skills' references.
7. Verify: tsc, lint, fmt, apps/server tests, repository-policy, server-lifecycle and workbench tests, system server-state and process-contracts, a real server run, then bun run check.
<!-- SECTION:PLAN:END -->
