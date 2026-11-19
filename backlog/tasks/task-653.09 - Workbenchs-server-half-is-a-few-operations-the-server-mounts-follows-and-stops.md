---
id: TASK-653.09
title: >-
  Workbench's server half is a few operations the server mounts, follows and
  stops
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T21:02:00Z'
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
- [x] #1 workbench's server interface is exactly mountWorkbenchRoutes(app, { runMutation, refusalStatus }), acceptPaneSocket(ws, req, vault), followRegistry(), prepareWorkbench(signal), closeBrowserOwners(accepted: Iterable<WebSocket>), stopWorkbench() and admittedClientCount(), and browser-contract keeps only shownConversationPath and the two explanation schemas (10 names); workbench is about 29 in total
- [x] #2 Workbench owns registry following with its watch private (started last in prepare, unwatched first in close), agent activity is private inside workbench, and the explanation routes join the mount
- [x] #3 listenAddress(), loopback diagnosis and listener-error reporting live in server-lifecycle, and server-lifecycle stays at 20 or fewer
- [x] #4 @archboard/server-requests moves from layer 0 to layer 3 and its server entry exports exactly requireVault, vaultOfRequest, namedVault, vaultOfUpgrade, statedVault and queryString
- [x] #5 Write observation is mountWorkbenchRoutes's first middleware on /api/architecture and vaultWritten is not exported; one test proves the model, history and explanation routes count the same writes as today
- [x] #6 stopWorkbench shares one stop promise per application generation, disposes activity before shutdown and clears that generation's memories and wiring in finally; one package test drives overlapping stops with a failing shutdown and asserts cleanup runs once, and a system test sees a feed socket close on stop
- [x] #7 closeBrowserOwners closes the sockets the app passes, feed sockets included, at today's point in the shutdown order, and workbench's socket tracking set is gone
- [x] #8 Wire bytes, the registry-following rule (ADR 0050), the shutdown order and socket admission are unchanged, and the repositories, browser-show-checkout, codex-workbench and staleness system tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Agent activity into workbench, private; write observation as mountWorkbenchRoutes's first middleware on /api/architecture.
2. Registry follow and its private watch into workbench (watch starts last in prepareWorkbench, unwatches first in closeBrowserOwners); pane-vaults.ts and the app's pane loop go.
3. Lifetime: prepareWorkbench(signal), stopWorkbench() with one stop promise per generation (activity disposed first, memories and wiring cleared in finally), closeBrowserOwners(accepted) taking the app's socket clients; tracking set goes.
4. listenAddress(), loopbackRefusal() and logHttpServerError() to server-lifecycle.
5. Vault-of-request helpers to a server entry of @archboard/server-requests (layer 0 -> 3), six exports.
6. Explanation routes join mountWorkbenchRoutes; ./panes and ./host go.
7. Ceilings, package descriptions, PanesReport EXPOSED_UNUSED, tests (overlapping stop with failing shutdown; same writes counted; feed socket closes on stop).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Branch deepen/653-09-workbench-server from deepen/module-depth 73e6f54de7 (still its head).

Interface. workbench ./server: mountWorkbenchRoutes(app, { runMutation, refusalStatus }), acceptPaneSocket, followRegistry, prepareWorkbench(signal), closeBrowserOwners(accepted), stopWorkbench(), admittedClientCount; ./browser-contract: shownConversationPath, explanationActionRequestSchema, explanationActionResultSchema (types AgentActivityMessage, ShownConversation*, ExplanationAction* stay). ./panes and ./host deleted. Code check: workbench 52 -> 29 names, INTERFACE_WIDE stays for TASK-653.13; no finding on server-requests or server-lifecycle. Ceilings (types counted): workbench 77 -> 53, server-lifecycle 16 -> 19, server-requests 4 -> 10, each rise exactly the names moved in.

Moves. Registry follow and its watch: apps/server repository-routes.ts -> workbench panes/services/registry-follow.ts (watch private; starts last in prepareWorkbench, unwatched first in closeBrowserOwners, and also in stopWorkbench so a startup rolled back after prepare leaves no watch). Agent activity: apps/server panes/announcements -> workbench panes/services/agent-activity.ts, private; its test moved with it. Write observation: first middleware of mountWorkbenchRoutes on /api/architecture (requireVault + addressed on non-GET), mounted where mountPaneRoutes was, before every /api/architecture route. Explanation routes: apps/server -> workbench explanations/routes, explainArchitecture private. listenAddress() (now { host, port, httpUrl, wsUrl }, absorbing serverUrl and formatHostForUrl), loopbackRefusal() (absorbing findExistingLoopbackListener and isLoopbackGuardedHost) and logHttpServerError -> server-lifecycle ./server-process. Vault of a request -> @archboard/server-requests/server (requireVault, vaultOfRequest, namedVault, vaultOfUpgrade, statedVault, queryString), layer 0 -> 3; apps/server uses diagnostics errorMessage in place of messageOf.

Lifetime. stopWorkbench shares one stop promise per generation (prepareWorkbench starts a new one); it unwatches, disposes activity, shuts down, and in finally forgets semantic pane contexts, presentations and wiring. The forceStop shares the same promise, so a failed shutdown is not retried within one generation. The app resource is renamed codex-workbench -> workbench; the agent-activity and registry-watch resources are gone; engine-state forgets only the model memory. closeBrowserOwners(acceptedSockets()) gets the ws server clients; the tracking set and trackAcceptedSocket are gone.

Tests. New packages/workbench/tests/server/api/server.test.ts: the model, history and explanation routes count the same writes (watched vaults through a model-store stand-in, with a held pane on a loopback socket); overlapping stops with a failing shutdown share one shutdown and each generation stops once (red with the old stop). New system test in architecture-feed.test.ts: SIGTERM closes a feed socket and the server exits on its own (red, hung, when the sockets are not passed). panes-on-screen.test.ts no longer injects a stub activity.

Outside the slice: docs/readme/assets.json (ask clip source path; hash left stale, as TASK-653.07 did); tests/system/browser navigator-support.ts and canonical-model-references.test.ts state the pane-report fields they read instead of importing PanesReport (EXPOSED_UNUSED fixed); WebSocketMessage stops being exported from browser-contract (its last outside user, pane-vaults.ts, went). Vault unchanged: its bindings to the moved files (Pane vaults, Model announcements, Vault requirement, Canonical explanation routes) and anchors naming prepareCodexWorkbench/stopCodexWorkbench/loopbackRefusal wait for the architecture slice.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workbench's server half is seven operations plus three browser-contract values: the server mounts mountWorkbenchRoutes(app, { runMutation, refusalStatus }), accepts pane sockets, calls followRegistry from the choose-checkout route, and starts and stops the workbench with prepareWorkbench, closeBrowserOwners(acceptedSockets()) and stopWorkbench. Registry following (with its private watch), agent activity, write observation and the explanation routes live in workbench; the listener helpers moved to server-lifecycle (19 names) and the vault of a request to @archboard/server-requests/server (layer 3, six names). workbench goes from 52 to 29 code-check names (ceiling 77 -> 53) and stays INTERFACE_WIDE until TASK-653.13; PanesReport and WebSocketMessage are no longer exported.

Behavior: wire bytes, shutdown order and socket admission are unchanged. stopWorkbench is now idempotent per generation, and a failed shutdown still forgets the generation's memories and wiring. A forced stop shares that failed stop and does not retry the shutdown.

Verified: types, lint:all, format:check, test:modules 5350 pass, test:repository 182 pass, test:system 228 pass, test:solo 15 pass, full browser lane 50 owners 0 fail. code check: no finding on server-requests or server-lifecycle.

Follow-ups for the orchestrator: two ceilings rose (server-lifecycle 16 -> 19, server-requests 4 -> 10), each by exactly the names moved in, against ADR 0058's rule that a ceiling never rises; the vault still binds the moved files, which the architecture slice settles.
<!-- SECTION:FINAL_SUMMARY:END -->
