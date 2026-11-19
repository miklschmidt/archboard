---
id: TASK-653.09
title: >-
  Workbench's server half is a few operations the server mounts, follows and
  stops
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T21:16:00Z'
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

Ceiling deviation redone as settled (decisions.md, "TASK-653.09 ceiling deviation: SETTLED"); no ceiling rises. listener-address.ts (listenAddress, loopbackRefusal, logHttpServerError) moved whole into apps/server (http/listener/services), private; the address is resolved once, and the app passes { port, httpUrl } to workbench as WorkbenchHooks.address and as prepareWorkbench(signal, address); server-lifecycle is unchanged from deepen/module-depth (16). @archboard/server-requests keeps four names: inVault, requestJson, strictReply and resolveVault(string | null | { upgrade: url }); only the upgrade path recovers a checkout; ReplySchema private, code-opener and web derive it from strictReply. The Express adapters (requireVault, vaultOfRequest with its WeakMap, statedVault translating a refusal to null, query-before-body reading, queryString) live in apps/server http/middleware/request-vault.ts and reach workbench as WorkbenchHooks.requireVault, vaultOfRequest and statedVault, so the write observation and the app's later routes read one WeakMap. server-requests stays at layer 3 (resolveVault reads workspace). Ceilings: workbench 52 (measured, one below 53 since WebSocketMessage went), server-lifecycle 16, server-requests 4; the earlier rises are undone by a later commit, not rewritten. Verified again: build, types, lint:all, format:check, test:modules 5350 pass, test:repository 182, test:system 228 (feed socket closes on stop), test:solo 15, browser lane 50 owners 0 fail; code check: workbench INTERFACE_WIDE 29, no finding on server-requests or server-lifecycle.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workbench's server half is seven operations plus three browser-contract values: the server mounts mountWorkbenchRoutes(app, hooks), accepts pane sockets, calls followRegistry from the choose-checkout route, and starts and stops the workbench with prepareWorkbench(signal, address), closeBrowserOwners(acceptedSockets()) and stopWorkbench. Registry following (with its private watch), agent activity, write observation and the explanation routes live in workbench. The app owns its listener address and its Express vault adapters and lends them through WorkbenchHooks (requireVault, vaultOfRequest, statedVault, address { port, httpUrl }); @archboard/server-requests keeps four names with resolveVault as its server end. No ceiling rises: workbench 77 -> 52, server-lifecycle 16, server-requests 4. workbench is 29 code-check names and stays INTERFACE_WIDE until TASK-653.13.

Behavior: wire bytes, shutdown order and socket admission are unchanged. stopWorkbench is idempotent per generation, and a failed shutdown still forgets the generation's memories and wiring; a forced stop shares that stop and does not retry the shutdown.

Verified: types, lint:all, format:check, test:modules 5350 pass, test:repository 182, test:system 228, test:solo 15, browser lane 50 owners 0 fail; code check: no finding on server-requests or server-lifecycle.

Follow-up for the orchestrator: the vault still binds the moved files, which the architecture slice settles.
<!-- SECTION:FINAL_SUMMARY:END -->
