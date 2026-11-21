---
id: TASK-653.08
title: >-
  Pane addressing and the pane routes live in workbench, and a server removes
  only its own pidfile
status: Done
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T20:41:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.07
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 4 of the archboard-deepen run. packages/server-lifecycle is wide (23 names): its ./panes rules are pane-registry decisions made outside the registry, and the server process half has no single owner of its pid and startup records. The pane rules, the pane keys, the pane routes and the pane socket handler move into workbench, and the process half becomes six functions. This ticket carries the run's one behavior change: the pidfile fix (point 3 of the settled entry). The settled design, every decision and its reason: the "Candidate 4, server-lifecycle: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-04-server-lifecycle.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: server-lifecycle (packages/server-lifecycle); workbench's pane registry and browser contract (packages/workbench/src/server/panes, packages/workbench browser-contract entry); the pane routes and socket handler leaving apps/server (apps/server/src/server/panes/connections/routes, websocket-connection); the server start and stop files (apps/server/src/server/start-stop/lifecycle); the pane command (apps/cli/src/cli/commands/pane).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on server-lifecycle. workbench stays wide until candidates 10a and 10b; its width falls to about 60 here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server-lifecycle has width 16, and ./server-process exports exactly recordServerPid, releaseServerPid, reportStartupOwnership, reportStartupEnd (a first-call-wins latch in the writer), one health read returning source state and frontend build, and staleFrontend; INTERFACE_WIDE clears on server-lifecycle
- [x] #2 The pane rules and the pane keys (parsePaneKey, paneAddressKey, interim in server-lifecycle from candidate 11) live in workbench's pane registry, and WebSocketMessage and AgentActivityMessage move to @archboard/workbench/browser-contract in the first commit with the pane rules
- [x] #3 workbench exports mountPaneRoutes(app, hooks), semantic-context routes included, and acceptPaneSocket(ws, req, vault); apps/server keeps the listener, the upgrade checks and the architecture feed; open and close are whole private operations (refusal checks, waiter installed before sending, send, cancel on a failed send, settle); registerPane absorbs liveness, the vault check, the shared-id warning and the focus publish; ./panes is about 16 and workbench about 60 from 75, and exports whose last outside caller moved in are deleted
- [x] #4 The pidfile fix, the run's one behavior change: releaseServerPid removes the pidfile only when it still holds the bytes this process wrote, launcher cleanup makes the same ownership check, and tests at the pidfile seam show that a release keeps a file another process recorded and removes this process's own; the pull request and the hand-off report it as the one behavior change
- [x] #5 A second end report in one process writes nothing, tested with a real pipe descriptor
- [x] #6 Every other wire byte is unchanged: route paths, status codes, refusal words, socket messages and health fields; recording-pane-addressing and pane-report-reading tests are rewritten through the registry operations and the old files deleted, and the server-state system tests pass unchanged
- [x] #7 The server-lifecycle and workbench package descriptions state the new ownership and the pidfile rule; no ADR unless an advisor's reason would be reopened by a later run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Branch deepen/653-08-server-lifecycle, based on deepen/module-depth 145a8428b6 (still its head). Six commits: pane move into workbench; ./server-host -> ./server-process with serverCodeState(); pidfile fix; terminal-record latch in the writer; descriptions and ceilings.

Widths. server-lifecycle 23 -> 16 code-check names (./server 5, ./server-client 3, ./config 2, ./server-process 6: recordServerPid, releaseServerPid, reportStartupOwnership, reportStartupEnd, serverCodeState, staleFrontend); ceiling 26 -> 16; no INTERFACE_WIDE. workbench 75 -> 52 code-check names (still INTERFACE_WIDE until candidate 10); ceiling 98 -> 77. ./panes 31 values -> 15 (mountPaneRoutes, acceptPaneSocket, trackAcceptedSocket, closeBrowserOwners, admittedClientCount, sendToEveryClient, forgetPanePresentations, forgetSemanticPaneContexts and repository-routes' seven) plus the PanesReport type. Exports whose last outside caller moved in were deleted: ./server publishPaneContext, tabSessionOf, handleCodexBrowserMessage, showConversation; ./host bodyOf, isRecord, statedVault.

Pane keys: per candidate 11's second amendment they stay in @archboard/model-contract for good; the moved pane rules and the pane socket import parsePaneKey/paneAddressKey from there. AC #2's key clause is read through that amendment.

Hooks: mountPaneRoutes(app, { runMutation, refuseRead, followRegistry, agentActivity }). acceptPaneSocket keeps its three arguments, so the agent activity it follows is named by mountPaneRoutes (one module slot, as codexWiring already is) and acceptPaneSocket refuses with a named error if the routes were never mounted.

Pidfile fix (the one behavior change): releaseServerPid removes the file only while it holds the bytes recordServerPid wrote; the launcher's removals after a failed start and after a stop check the pid they know (stop's was unconditional). Tested at the pidfile seam (pidfile.test.ts isolated child). Terminal-record latch: tested with a real pipe on fd 3 of a child (server-startup-terminal.test.ts).

Validation: build, types, lint:all, format:check, test:modules (5348 pass, 1 skip), test:repository (181), test:system (227), test:solo (15), server-state lane after each ownership change, whole browser lane (50 owners, 73 pass). check code --fail-shallow-modules: no finding on server-lifecycle (exit 1 from pre-existing warnings, plus anchor warnings on Pane rules because the vault still binds the old paths). Footprint gate fails until the proposal names the moved modules; the vault was left unchanged as instructed.

Merged into deepen/module-depth. Footprint gate: exit 1 with recorded exceptions (proposal commit e683fa156a): Pane session, Pane vaults, Architecture context input (type-import path only), the CLI's Panes (private paneWords). Unbound: this ticket and six system test files. For TASK-653.09: workbench exports PanesReport with no outside user (EXPOSED_UNUSED).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pane addressing, layout, report, routes and socket handler now live in workbench (mountPaneRoutes(app, hooks), acceptPaneSocket(ws, req, vault)); the socket message types are in @archboard/workbench/browser-contract; server-lifecycle is 16 names with ./server-process as six functions. One behavior change: a server removes only the pidfile that still holds the record it wrote, and the launcher removes one only for the pid it knows. The startup writer keeps one terminal record per process. Every wire byte is otherwise unchanged; all lanes and the full browser lane pass. Follow-up for the orchestrator: the vault and proposal sL6y1FLr still bind the old paths, so the footprint gate and the Pane rules anchors wait for the architecture slice.
<!-- SECTION:FINAL_SUMMARY:END -->
