---
id: TASK-385.05
title: Pane news is owned by a test at the application entrypoint
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-01 10:24'
labels:
  - frontend
  - test
dependencies: []
parent_task_id: TASK-385
priority: medium
type: task
ordinal: 669000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-385.03 fixed how pane news reaches the board stage (pane elements no longer depend on the records, onVariantChange reads through a binding, PaneDiagram is memoized) but left it without a test: the hooks are private, and the module lint lets tests import only module-root entrypoints. The user asked for tests at module seams, through the components that consume those hooks. The consumer is Application, the application module's entrypoint, which needs the routing host, faked fetch and faked sockets to mount.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test mounts Application through its entrypoint over a faked server (fetch and sockets) and drives pane news the way the server sends it
- [ ] #2 The test fails when a claim, an agent's doing or its activity renders the board stage that shows the board
- [ ] #3 The test runs in the module lane in a few seconds
<!-- AC:END -->
