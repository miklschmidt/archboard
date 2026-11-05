---
id: TASK-579.04
title: A release server listens on 27242 and the browser opens archboard.localhost
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:45:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/workspace/src/runtime/services/source-checkout.ts
  - packages/workbench/src/server/services/listener-address.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1025000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release has no git checkout, so the port rule falls back to 3000, where the main checkout server listens, and the two refuse each other. Chrome and Firefox resolve every `*.localhost` name to loopback themselves (RFC 6761), but the system resolver does not on every Linux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In release mode the server listens on 127.0.0.1:27242, and a set `ARCHBOARD_URL` or `--url` still decides
- [ ] #2 Every address shown to a person or opened in a browser is `http://archboard.localhost:27242`; the CLI itself connects to 127.0.0.1
- [ ] #3 A page served at archboard.localhost works: panes, sockets, the core and the painter load
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Release default port 27242 in source-checkout.ts (installationPort), used by the CLI default URL and the server listener. 2. browserUrl maps a release loopback server at 27242 to archboard.localhost for everything shown or opened by a person; the CLI connects to 127.0.0.1. 3. The browser origin guard accepts the Host archboard.localhost. 4. Verify in a headless browser at archboard.localhost against a worktree server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: browserUrl() (workspace source-checkout.ts) maps a loopback server at 27242 to archboard.localhost in release mode only; a set ARCHBOARD_URL/--url on another port is shown as named. Shown or opened by a person: status/start/restart url, the spawn stderr line, the BROWSER_REQUIRED message, pane report and pane-route messages. Connection diagnostics and headless recording/replay pages keep 127.0.0.1 (machine addresses). The origin guard (code-opener browser-csrf) accepts the exact host archboard.localhost; without it the page's pane socket is refused. Interface-width ceilings hold: no new export beyond browserUrl. Evidence: workspace source-checkout.test.ts, code-opener browser-csrf.test.ts. By hand: a worktree server (port 18176) loaded at http://archboard.localhost:18176 in agent-browser: repo list, pane socket (websocket_clients 1), diagram via core and painter rendered, no errors; a release-mode status printed http://archboard.localhost:27242. A full release server cannot start until TASK-579.07 handles --internal-server.
<!-- SECTION:NOTES:END -->
