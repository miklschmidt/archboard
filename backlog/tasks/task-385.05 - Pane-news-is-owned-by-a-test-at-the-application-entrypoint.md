---
id: TASK-385.05
title: Pane news is owned by a test at the application entrypoint
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:24'
updated_date: '2026-10-01 10:33'
labels:
  - frontend
  - test
dependencies: []
parent_task_id: TASK-385
priority: medium
type: task
ordinal: 720000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-385.03 fixed how pane news reaches the board stage (pane elements no longer depend on the records, onVariantChange reads through a binding, PaneDiagram is memoized) but left it without a test: the hooks are private, and the module lint lets tests import only module-root entrypoints. The user asked for tests at module seams, through the components that consume those hooks. The consumer is Application, the application module's entrypoint, which needs the routing host, faked fetch and faked sockets to mount.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test mounts Application through its entrypoint over a faked server (fetch and sockets) and drives pane news the way the server sends it
- [x] #2 The test fails when a claim, an agent's doing or its activity renders the board stage that shows the board
- [x] #3 The test runs in the module lane in a few seconds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mount Application through its entrypoint with the routing host, as frontend/main.tsx does, over happy-dom.
2. Fake the server at the network: fetch answers the pane report, the board list and the picture. A FakeSocket class stands in for WebSocket, and the test opens it and speaks the server's messages on it.
3. Register the pane, send pane_board, and wait until the stage is drawn.
4. Send a claim, an agent's doing line, its activity and the release. Check that the shell shows each (claim banner, working now) and that the stage element's React props object is the same one.
5. Board proposals: none.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red checks: putting the whole panes object back in usePaneViews' dependencies turns the test red, and so does removing the PaneDiagram memo. With both in place it is green. It runs in about 0.7 s. React and the application load through dynamic imports after the DOM is registered, so React finds the page's globals.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/ui/application/tests/pane-news.test.tsx mounts Application through its entrypoint over a server faked at fetch and at the socket. It puts a board in the pane, then delivers a claim, an agent's doing line, its activity and the release the way the server sends them. It checks that the shell shows each and that the board stage is not drawn again. It is red when either part of the TASK-385.03 fix is undone, and it runs in about 0.7 s.
<!-- SECTION:FINAL_SUMMARY:END -->
