---
id: TASK-324
title: 'Code names say Archboard server, and host only where it means something else'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 23:24'
updated_date: '2026-09-23 23:39'
labels:
  - naming
dependencies:
  - TASK-323
priority: low
type: chore
ordinal: 556000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-323 renamed the canvas server to the Archboard server in prose, code still names it after the canvas and the host: the src/server/canvas module, canvas-client and canvas-spawn-target in the engine, CANVAS_SERVICE_NAME, CanvasCodexWorkbenchHost, canvas-codex-host, src/shared/codex-realtime-host, and about 1,400 uses of host in 360 files. Host also has other meanings there (the renderer's environment, the HTTP Host header, a repository host), which keep their names. CANVAS_SERVICE_NAME is what the CLI checks to tell its own server from a foreign service, so changing it makes a new CLI treat an old server as foreign until it restarts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Modules, types, functions and constants that mean the Archboard server are named after it
- [ ] #2 Host remains only where it means the renderer environment, the HTTP Host header or a repository host
- [ ] #3 Comments follow the same names
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move modules and files named after the canvas or host that mean the Archboard server (src/server/canvas -> src/server/archboard, engine canvas-* -> server-*, shared/canvas-startup-terminal, shared/codex-realtime-host, tests/system/canvas-state and owned-canvas support), rewriting imports, package.json lanes, lint config and doc paths. Commit.
2. Rename exported and local identifiers that mean the server (canvas -> server, host -> server or what the thing is); CANVAS_SERVICE_NAME -> ARCHBOARD_SERVICE_NAME with value archboard-server. Commit.
3. Sweep comments, test names, log and error text and model-facing text for canvas and host meaning the server. Commit.
4. Gate lanes one at a time; list stale vault code bindings for the parent.
<!-- SECTION:PLAN:END -->
