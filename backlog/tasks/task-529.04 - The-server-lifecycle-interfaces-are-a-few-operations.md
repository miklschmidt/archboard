---
id: TASK-529.04
title: The server lifecycle interfaces are a few operations
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:44:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 945000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the server-lifecycle and server-requests package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [x] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Interfaces measured with /tmp/iface/count.ts: server-lifecycle 9 subpaths/75 names -> 5/29; server-requests 1/10 -> 1/6 (85 -> 35). ./server is ensureServerRunning (now answers the pid), stopServer (own file), restartServer, serverStatus (absent, conflict or running) and connectedBrowsers; the CLI no longer reads health, the pid file or the port itself. ./startup-terminal folded into ./server-host as reportStartupOwnership and reportStartupEnd; recordServerPid writes and sweeps pid files. ./request-context folded into ./server-client as stateInvocation and statedInvocation. The board client, the claim and pane requests and the install version moved into apps/cli/src/cli/clients/server and store/package-version, their only caller. ./pane-messages folded into ./panes; resolvePane replaces resolvePaneSpec and soloPane. server-requests: requestJson(url, {method, payload, signal}) replaces json, post, mutation and cancellable; strictReply takes the same request; boardQuery inlined. Checks: type-check 0, lint 0, focused tests and tests/system/repository-policy pass, server-spawning CLI system tests pass. spawn.ts verifyCodexExecutable call left as it was.

Review (review/lifecycle, merged): no behavior change. Lowered the server-lifecycle and server-requests ceilings to 29 and 6, and corrected two comments that claimed stop refuses a server holding work. Open: vault bindings still name the deleted semantic-board-client.ts (board closing step).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
server-lifecycle's ./server is five operations: ensureServerRunning, stopServer, restartServer, serverStatus and connectedBrowsers (stop in stop.ts), with startup ownership reporting behind reportStartupOwnership, reportStartupEnd and recordServerPid. The board, claim and pane clients moved to apps/cli/src/cli/clients/server/, and server-requests is one requestJson(url, {method, payload, signal}). Width 75 -> 29 (server-requests 10 -> 6). Verified by type-check, lint, the CLI and server tests and the system lane.
<!-- SECTION:FINAL_SUMMARY:END -->
