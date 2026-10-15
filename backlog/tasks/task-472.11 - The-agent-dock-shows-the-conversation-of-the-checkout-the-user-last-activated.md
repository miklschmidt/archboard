---
id: TASK-472.11
title: The agent dock shows the conversation of the checkout the user last activated
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 09:32'
labels:
  - frontend
dependencies:
  - TASK-472.10
  - TASK-472.05
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 831000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With one workhorse per checkout, the agent dock must show one of them. ADR 0050 decides the shown conversation: the checkout the user last activated by focusing a pane, opening a board or drilling down, or picked from a list of the tab's live workhorses. What an agent does to a pane never changes it, so it never changes while somebody types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focusing a pane, opening a board from the navigator and drilling down switch the shown conversation to that board's checkout, and `browser show` never does
- [ ] #2 The dock lists the live workhorses of the tab session by repository and checkout, and picking one shows it
- [ ] #3 The list marks a workhorse that waits for an approval or for the user
- [ ] #4 A typed message goes to the shown checkout's workhorse, and New conversation replaces only that workhorse
- [ ] #5 A coordinator turn shows in the conversation of the workhorse it delegated to, and a turn that delegated nothing shows in the conversation shown while it ran
- [ ] #6 The Stop control stops the shown workhorse, and a spoken stop stops every running workhorse of the tab session
- [ ] #7 The list and its marks are operable from the keyboard and have accessible names
- [ ] #8 PRODUCT.md's description of the agent dock and the archboard skill describe the shown conversation as built
- [ ] #9 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
0. Contract commit (parent): the snapshot field workhorses {kind codex_workhorses, shown, entries [{checkout, repository, live, running, waitingForApproval, waitingForUser}]} in src/shared/codex-browser-model, the activation route contract POST /api/panes/conversation in src/shared/shown-conversation, the wire.ts delta parser line, BrowserOwnerProjection.workhorses.
1. Backend (implementer, worktree): one shown checkout per tab in tab-sessions.ts, pinned on first read and changed only by the activation route (browser origin guard; a list pick only to a live workhorse or a pane of the tab, else CHECKOUT_NOT_SHOWABLE); the gateway's checkoutOf seam reads the shown checkout, so a typed message, New conversation, Stop and approvals follow it; onShownChange republishes every socket of the tab; the workhorse list in the owner projection; coordinator turn homes (shown at start, checkouts it gave work to) and keepTurn in the timeline target before the budget; a coordinator tool stop_workhorses calling stopWork(null), with the coordinator instructions. A chosen-checkout change no longer moves the dock.
2. Frontend (parent): the browser activates on a user focus change, a successful user board open (navigator, drill-down, open beside), Back/Forward, a list pick and Fix with Codex; never on browser show/open/close, narration or first-load restore. A conversation list in the agent dock (toggle group, keyboard, accessible names, marks as text), shown with two or more entries.
3. Owners: shown-conversation route and projection tests on the server, activation tests in src/ui/application/tests, a rendered list test, dispatcher test for stop_workhorses, one browser segment in codex-text-workbench.test.ts.
4. Docs: PRODUCT.md agent dock, AGENTS.md Codex invariant, CONTEXT.md, the archboard skill. Boards: proposals TASK-472.11 on Agent workbench, Codex workhorse, Voice coordinator, Browser application, Live panes, drawn after the code lands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend slice built (implementer, 2026-10-15), commits 329330518, 3c3e0a9a6, d4b14ac10, b8c825f35. Decisions and their reasons:

- Shown checkout per tab: in the tab registry (src/server/archboard/lib/tab-sessions.ts), beside the tab's grace, so it outlives every Codex child and ends with the tab. shown(tab, pin) pins the asking pane's own checkout on the first read; show(tab, checkout) is the only change and tells onShownChange; current(tab) peeks without pinning (the route and the coordinator-turn record use it). forgetAll clears it.
- The gateway seam keeps its shape: CodexWorkbenchServer.checkoutOfBrowser became shownCheckoutOf(browserId) (codex-wiring.ts), falling back to the pane's own checkout when its socket names no tab (only a teardown race). The server's onPaneVaultMove went away with its only listener: the dock follows onShownChange instead, so neither an agent's browser show nor a new chosen checkout moves it. pane-vaults.ts no longer has move observers.
- Liveness: a workhorse is live once its workhorse start has a thread (snapshot().threadId), not by reading its thread link. Same fact, and it needs no thread-link read in the projection (the generation fixture has no link reads).
- Activation route: src/server/archboard/lib/shown-conversation-route.ts, mounted in pane-routes.ts as POST SHOWN_CONVERSATION_ROUTE with createBrowserOriginGuard("mutation") and requireVault. A pick is showable when it is a live workhorse's checkout, a pane's of the tab, or the one shown now (a no-op). A bad body is 400 BAD_REQUEST, the repository's code for one. The live checkouts reach the route through codexWiring.codex.liveWorkhorseCheckouts, installed with the generation's lifecycle signals.
- Lease after a switch: the existing ensureLeaseBinding already compares the lease's checkout with checkoutOf, so a command or renewal under a lease taken before a switch is refused link_changed and the lease is released; the next claim binds the shown checkout. No new lease code.
- Workhorse list: codex-workbench-workhorse-list.ts, read in readBrowserOwnerProjection with shown = context.checkout and repositoryOf = repositoryOfVault(vaultIn(checkout)) through CodexWorkbenchServer.repositoryOfCheckout. Entries are bounded to BROWSER_WORKHORSE_LIMIT (the shown one first, then the newest live ones), so a snapshot never exceeds the contract. The shared model now exports BROWSER_WORKHORSE_LIMIT (an export, no shape change).
- Coordinator turn homes: CodexWorkbenchTabSessionState.coordinatorTurnHomes, bounded at MAX_DELEGATIONS. shownAtStart is noted in the sessions store's onNotification for a turn/started on a thread the session's coordinator owns (byThread owner with no workhorse), not in deliver(), so it needs no coordinator snapshot. gaveWorkTo is a second operations subscription per workhorse in buildWorkhorse: delegate, steer, and queue add/start. keepTurn is the last parameter of ServerTimelineOwner.readTarget and is applied in projectData before the projection budget. The ingestion budget still bounds the retained coordinator history, so a conversation shows its turns among the coordinator's newest retained turns.
- Spoken stop: stop_workhorses in archboard_workhorse with the new authority target server_tab_session_workhorses and only the tool correlation links; port stopWork on CodexCoordinatorToolsOptions, wired in codex-workbench-session-bindings.ts to scope.stopWork(null) (the scope gained stopWork). Manifest digest 98288fd3..., coordinator instructions digest b9aa33ff....
- Lint limits: the notification-thread helpers moved from codex-workbench-timeline.ts to codex-timeline-live.ts; sessions.ts stays at 599 lines.

Owners: src/server/archboard/tests/shown-conversation.test.ts (pin, show, end), tests/system/server-state/shown-conversation.test.ts (route, refusals, origin guard, every pane follows, New conversation and a message from a payments pane reach the shop workhorse by cwd and turn/start thread, an agent's show leaves the dock), codex-workbench-workhorse-list.test.ts (entries, order, marks), codex-workbench-delegations.test.ts and codex-workbench-sessions.test.ts (homes), codex-workbench-timeline-target.test.ts (keepTurn), gateway-checkouts.test.ts (a lease from before a switch is refused link_changed, a new one runs on the shown workhorse), codex-coordinator-tools/tests/stop.test.ts and codex-workbench-session-bindings.test.ts (stop_workhorses).

Board proposals closed and adopted (2026-10-15). Code check: `archboard check --code` with and without `--variant TASK-472.11` gave no `>` line on any board. Two `<` lines (the proposals clear them): Live panes ANCHOR_SYMBOL_MISSING for onPaneVaultMove (the move observers went away) and RELATIONSHIP_UNDRAWN Pane routes -> Browser origin guard (now drawn). The warnings in both runs are not about the task (pageUrl, drawRequest anchors on Archboard, Board rasterizer and Command interface; Repository listing undrawn on Archboard server routes, TASK-472.09 territory). After adoption `archboard check` reports no diagnostics and `check --code` equals the with-variant run.

Corrected to HEAD before adoption: the tab pins its shown checkout to the focused pane's checkout, else the asking pane's (60072fa16, pinnedCheckoutOf), on Agent workbench and Live panes; a coordinator turn counts as giving work only when the work was delivered or its outcome is unknown (6ea662eb3, givesWork), on Agent workbench and Voice coordinator; the gateway judges a finished command by its own workhorse's link, so a switch meanwhile does not make its outcome unknown (94e629c92, ensureLinkStands, readBindingIn), on Agent workbench and Codex workhorse; the browser does not activate on Back or Forward (812404509), and one activation is built by the application and shared by the shell actions, pane focus, the list and Fix with Codex, which reads the workbench again before it asks (24696a497, 128af3b10), on Browser application; the list is moved by the Up and Down arrows (6983748ff). Pane vaults and Shown conversation (Live panes) gained a description. Each proposal carries the board's scope as its summary.

Footprint read against base de53485ba (the parent of eefc09f3f, the first commit with a Refs: TASK-472.11 trailer; fde561836 merged the backend). The range also holds TASK-472.09, TASK-471.03 and TASK-472.14 commits. changedNotNamed decisions: Workhorse checkouts (codex-checkouts.ts, Agent workbench) changed only by a79cdac27, TASK-472.09: not ours. Repository list (repositories.ts, Live panes) changed only by 4ea5feee9 and 2f6f090d7, TASK-472.09: not ours. Authored instructions (src/runtime/codex-instructions, Codex workhorse and Voice coordinator) by 3c3e0a9a6: the coordinator instructions gained the sentence about stop_workhorses; the part still holds the instructions and their digest, so the board stays true. Workbench transport (src/ui/workbench-transport, Browser application) by eefc09f3f: one delta parser line for the new workhorses field; the channel is the same. namedNotChanged: Thread link, Workhorse queue, Workhorse start, Server requests, Pane registry and Browser origin guard are named only by a relationship, which is normal. Approvals and Conversation start (Agent workbench) are named by part though no commit changed their module: their words changed because the shown checkout, not the pane's, now decides which workhorse an approval is shown with (visibleApprovalViews in the owner projection, called with the shown checkout) and which workhorse a conversation start and New conversation work on (the gateway's checkout seam). The module code was right already, so the description is the only change. d4b14ac10 is the one large commit (over 30 files): it is the backend feature itself, not a sweep.

Boards behind without a proposal: Archboard server (src/server/archboard, container bound to a directory) draws no part that the task changed (the activation route is drawn on Live panes) and stays right. Archboard (repo-registry.ts) was moved only by TASK-471.03 and TASK-472.14. The other behind boards are renderer boards, not this task's. Adopted versions: Codex workhorse 37, Voice coordinator 50, Agent workbench 65, Live panes 44, Browser application 70.
<!-- SECTION:NOTES:END -->
