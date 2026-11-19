---
id: TASK-653.09
title: >-
  Workbench's server half is a few operations the server mounts, follows and
  stops
status: To Do
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T17:33:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.08
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 10, server half (10a), of the archboard-deepen run. After candidate 4, packages/workbench still hands apps/server about 53 names: registry following, agent activity, start and stop, socket tracking, listener helpers and vault-of-request helpers are assembled in the app. Workbench owns them and hands out seven operations; the listener helpers go to server-lifecycle and the vault helpers to @archboard/server-requests. The settled design, every decision and its reason: the "Candidate 10, workbench: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-10-workbench.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Decisions marked [10a] and [both] in the tree apply; candidate 9's correction (point 5) moves isSpeakingLevel, which is 10b's concern.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: workbench server side (packages/workbench/src/server); @archboard/server-requests (packages/server-requests); server-lifecycle (packages/server-lifecycle), which receives listenAddress, loopback diagnosis and listener-error reporting; apps/server's composition (application, start-stop lifecycle, repository-routes, service-routes, state).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on server-requests and server-lifecycle. workbench keeps its INTERFACE_WIDE finding at about 29 names until 10b; the check shows that count.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 workbench's server interface is exactly mountWorkbenchRoutes(app, { runMutation, refusalStatus }), acceptPaneSocket(ws, req, vault), followRegistry(), prepareWorkbench(signal), closeBrowserOwners(accepted: Iterable<WebSocket>), stopWorkbench() and admittedClientCount(), and browser-contract keeps only shownConversationPath and the two explanation schemas (10 names); workbench is about 29 in total
- [ ] #2 Workbench owns registry following with its watch private (started last in prepare, unwatched first in close), agent activity is private inside workbench, and the explanation routes join the mount
- [ ] #3 listenAddress(), loopback diagnosis and listener-error reporting live in server-lifecycle, and server-lifecycle stays at 20 or fewer
- [ ] #4 @archboard/server-requests moves from layer 0 to layer 3 and its server entry exports exactly requireVault, vaultOfRequest, namedVault, vaultOfUpgrade, statedVault and queryString
- [ ] #5 Write observation is mountWorkbenchRoutes's first middleware on /api/architecture and vaultWritten is not exported; one test proves the model, history and explanation routes count the same writes as today
- [ ] #6 stopWorkbench shares one stop promise per application generation, disposes activity before shutdown and clears that generation's memories and wiring in finally; one package test drives overlapping stops with a failing shutdown and asserts cleanup runs once, and a system test sees a feed socket close on stop
- [ ] #7 closeBrowserOwners closes the sockets the app passes, feed sockets included, at today's point in the shutdown order, and workbench's socket tracking set is gone
- [ ] #8 Wire bytes, the registry-following rule (ADR 0050), the shutdown order and socket admission are unchanged, and the repositories, browser-show-checkout, codex-workbench and staleness system tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
