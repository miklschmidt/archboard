---
id: TASK-472.10
title: 'Each checkout has its own workhorse, and the coordinator works in no checkout'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 07:50'
labels: []
dependencies:
  - TASK-472.04
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 830000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tab session has one workhorse and one coordinator, both running in the archboard checkout that the server runs from, so a thread reads archboard's agent instructions and skills even about another repository's boards. ADR 0050 gives a tab session one workhorse for each checkout, running in that checkout so that it reads that repository's AGENTS.md, skills and Codex configuration, and one voice coordinator for the whole app in a directory of its own. The implementation brief of TASK-447 will name the checkout and `-C`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A workhorse thread starts with its checkout as its working directory and workspace root, and the workhorse of an untracked vault starts in the directory that holds the vault
- [x] #2 A tab session holds at most one workhorse per checkout, each with its own thread link, queue and approvals
- [x] #3 The coordinator starts in a directory of its own under the state directory, reads boards with `-C`, and gives work in a checkout to that checkout's workhorse, starting it when there is none
- [x] #4 A typed message names its checkout and reaches that checkout's workhorse, starting one when there is none
- [x] #5 Pane briefs, board news and workhorse news name the checkout of each board
- [x] #6 A workhorse stays linked when the chosen checkout of its identity changes
- [x] #7 A workhorse stop requested for a checkout stops only that workhorse, and a stop requested for the whole tab session stops every running workhorse
- [x] #8 AGENTS.md's Codex invariant, PRODUCT.md, CONTEXT.md and the archboard-dev skill describe one coordinator and one workhorse per checkout as built
- [x] #9 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards that this task changes. The parent draws their proposals, named TASK-472.10, after the merge.
- Agent workbench: a tab session holds one coordinator and a map of workhorses by checkout. The browser gateway reads the workhorse of the checkout of the pane.
- Codex workhorse: a workhorse belongs to one checkout and runs in it. Its link, queue, operations and board-change delivery are its own.
- Voice coordinator: it runs in a directory of its own. Its workhorse tools name a checkout. A delegation starts the workhorse of the checkout. Workhorse news names the checkout.
- Codex session: the app-server child runs in the coordinator directory. Its PATH starts with the bin directory of the server.

Steps:
1. Hand-off rule from the TASK-472.08 review. This is done and committed. A command with a set ARCHBOARD_URL hands off to no checkout. The PATH of the Codex child starts with the bin directory of the server. So every thread runs the source of the server, in each checkout.
2. Workhorse key. A tab session and a checkout name one workhorse. The checkout is the directory that holds the vault: the checkout root, or the holder of an untracked vault. The key is the thread-link key, so each workhorse has its own link. The generic browser gateway reads the link of the workhorse of a pane. The pane gives its tab session and the checkout of its vault. A typed message names its checkout through the pane that sends it. The first message makes the link for that checkout. Fix with Codex asks through the focused pane, and that pane is in the diagnosed vault. So the repair runs in the workhorse of the diagnosed checkout. The frontend does not change, because the dock follows the focused pane. TASK-472.11 adds the shown conversation and the list.
3. Sessions store. A tab session keeps the coordinator, voice, spoken approval, coordinator tools, callbacks and its semantic publisher. It also keeps a map from checkout to workhorse. A workhorse holds its starter, its semantic publisher, its board-change delivery, its queue, its operations and its link action. The publisher of a workhorse reads the changes of its own vault. A session has at most one workhorse for each checkout, built on first use. Notifications reach the operations of every workhorse. The end of a session clears every link and unloads every thread.
4. Working directories. A workhorse thread starts with its checkout as its working directory and workspace root. The coordinator directory is under the owner directory of the server: codex-workbench/canvases/<port>/coordinator in the state directory. The coordinator, the app-server child, config/read and the epoch start use it. It holds .agents/skills/archboard, a link to the skill of the server. The pinned Codex reads .agents/skills in a directory outside git (checked with skills/list). A thread that the archboard_app tools start runs in the checkout of its caller.
5. Coordinator tools. The four workhorse tools take a required checkout. A delegation to a checkout without a workhorse starts one first. The other three tools refuse a checkout without a workhorse. The manifest digest changes.
6. Callbacks. Each callback is correlated with the workhorse that its thread names. Semantic news is correlated with the workhorse that voice is bound to. Workhorse news names its checkout. The own-change check covers every workhorse thread of the tab.
7. Briefs. A pane brief and board news name the checkout of each board. The repository field of the brief becomes the checkout of the board.
8. Stop. The session offers a stop for one checkout and a stop for the whole tab session. The browser interrupt stops only the workhorse of the checkout of the pane. TASK-446 owns the spoken stop tool, and it calls the stop for the whole session.
9. Instructions. The coordinator works in no checkout. It passes -C on every command and names the checkout on every workhorse tool. The workhorse works in its checkout. The digests change in authored.ts and in the thread-tools contract test.
10. Owners. Sessions module tests: one workhorse for each checkout, with its own link and queue. A stop for one checkout and a stop for the whole session. After a change of the chosen checkout, the workhorse stays. Coordinator tool dispatch by checkout. Workhorse news that names the checkout. The Codex process seam: the fake Codex logs thread/start, and the test checks the working directory of each thread. A CLI owner: a command in the coordinator directory without -C is refused with VAULT_NOT_FOUND.
11. Docs. AGENTS.md (the Codex invariant), PRODUCT.md, CONTEXT.md, the archboard-dev and archboard skills, and INSTALL.md for any setup change, as built.
12. Simplify. Run the gate with ARCHBOARD_REPOS=/tmp/t10-gate-repos.json. Record the validation in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (hand-off vs workhorse checkouts, raised in the TASK-472.08 review): a command whose environment sets ARCHBOARD_URL hands off to no checkout (src/runtime/engine/source-checkout.ts handOffTarget). The URL already names the server, and the source that matters is the one that server runs. That alone is not enough: a thread's `archboard` on PATH links to one checkout, so with a worktree server a thread in another checkout would run the main source and the identity probe would refuse it (OtherSourceError). So the Codex child environment also puts the server's own bin directory first on PATH (src/runtime/codex-process/lib/environment.ts, archboardServer.binDirectory). Every thread's archboard then runs the server's source in whichever checkout it works. Owners: src/runtime/engine/tests/source-checkout.test.ts 'a command whose environment names its server runs where it is, as a workhorse in a worktree does', and src/runtime/codex-process/tests/storage.test.ts (PATH leads with the server bin). AGENTS.md and TESTING.md say so.

Built (implementer, 2026-10-15). Decisions and their reasons:

- Workhorse key: workhorseLinkKey(tabSessionId, checkout) = JSON [tab, checkout] in src/server/codex-workbench/lib/tab-session.ts, parsed by parseWorkhorseLinkKey. It is the thread-link key, so each workhorse has its own link. The checkout of a vault is checkoutOfVault (src/runtime/engine/vault-finder.ts): the holder of <x>/.archboard/vault, else the vault itself. The generic gateway asks checkoutOf(browserId) on every read and command, because a pane can move to another vault while it stays open.
- Sessions store (codex-workbench-sessions.ts, with its types in codex-workbench-session-contract.ts and the per-workhorse parts in codex-workbench-session-workhorses.ts): a tab keeps coordinator, voice, spoken approval, coordinator tools, callbacks and its own semantic publisher; a map checkout -> workhorse holds starter, publisher, delivery, queue, operations and link actions. A workhorse is built on first use by a create, a delegation or a queue mutation; a projection read never builds one and shows an unavailable queue and no board news.
- Approvals: links tab:<id> (the coordinator's, shown to every pane of the tab) and workhorse:<link key> (shown to the panes of that checkout). The end of a tab session settles both forms.
- New conversation: it replaces the workhorse of the pane's checkout and keeps the coordinator (coordinator.ensure, not replace), because the coordinator speaks for every workhorse of the tab. The old workhorse thread is retired once idle.
- Voice: voice binds to the workhorse of the pane it started from (state.voiceCheckout). A voice stop is accepted from any pane of the tab, whatever checkout it shows; appendText still needs the same socket and link.
- Stop: session.stopWork(checkout | null) interrupts the active turn of one workhorse or of every workhorse, tracked from turn/started and turn/completed. The browser interrupt refuses a thread that is not the pane's link thread, so it stops only its checkout's workhorse. stopWork has no production caller yet: TASK-446 adds the spoken stop and calls stopWork(null).
- Delegation: the coordinator call owner runs readyDelegatedWorkhorse (codex-checkouts.ts) before dispatch, which starts the named checkout's workhorse when its link cannot run turns; a failed start leaves the delegation to refuse. A tool's checkout is canonicalized by checkoutNamedBy: the real path of a directory that holds a vault, or of a vault.
- Board news: one publisher per workhorse, filtered to the vaults of its checkout that its tab hears; the tab publisher feeds voice and callbacks as the voice-bound workhorse.
- Coordinator directory: <state>/codex-workbench/canvases/<port>/coordinator, with .agents/skills/archboard linking to the server's skills/archboard. The app-server child, config/read and the epoch_start workspaceRoot use it.
- Fix with Codex: no change needed. It asks through the focused pane, whose vault is the diagnosed one, so the repair goes to the workhorse of the diagnosed checkout (gateway-checkouts.test.ts proves a pane's message reaches its own checkout's workhorse).
- System test codex-outside-change: the reload segment now moves the pane back to the first checkout before the reload, because the other vault is another checkout whose workhorse nothing started.
- Lint limits: codex-wiring.ts pane helpers moved to codex-session-panes.ts; the session types moved to codex-workbench-session-contract.ts; the thread-link tests moved to codex-workbench-thread-links.test.ts.

Board proposals closed and adopted (board agent, 2026-10-15). Footprint read against base bdeb8624f (parent of the first code commit d0af9afa3, found by the Refs trailer). TASK-472.10 was made on a branch merged into main by 015ceee52; the range bdeb8624f..HEAD also holds 60+ commits of TASK-472.07, .08, .14, .15 and .16 that main took meanwhile, so every changedNotNamed part was attributed by whether a TASK-472.10 commit touched its path.
Code check: `archboard check --code` with and without --variant TASK-472.10 gave no `>` line on any of the six boards. One pre-existing pair of ANCHOR_SYMBOL_MISSING warnings on Voice coordinator (routeCoordinatorTool, routeCallback in codex-workbench-sessions.ts) was about code this task changed: the session type moved to codex-workbench-session-contract.ts. Both anchors now cite onServerRequest, the call that delivers the route; the warnings are gone. Three warnings that remain (pageUrl, drawRequest) belong to other boards and tasks.
Adopted: Codex session v23, Voice coordinator v45, Codex workhorse v31, Agent workbench v59. Extra proposals, drawn, checked and adopted: Live panes v38 (Pane vaults -> Codex workbench event, a pane moved into another vault, anchored on onPaneVaultMove in codex-wiring.ts) and Command interface v79 (Source checkout: a set ARCHBOARD_URL hands off to no checkout).
Corrections to what was built: Conversation start no longer readies the coordinator for a delegation (ensureStarted leaves it alone; only New conversation readies it); the gateway hears pane vault moves; a workhorse approval is shown only to the panes of its checkout and its terminal waits only for them; a turn ends on the thread it started on; a delegation from a tab that has gone is refused, not left waiting; the replay fingerprint and the refusal text of the workhorse tools name the checkout; threads an app tool starts work in their caller's checkout; per-workhorse board news is filtered to the vaults of its checkout. The proposals each carry the board's scope as summary.
Deviations explained: Workhorse start, Workhorse operations, Workhorse queue, Thread link, Board-change delivery, Semantic context and Approvals are `named, not changed` on Agent workbench and Codex workhorse. Their runtime code did not change (the modules already took a checkout root); the task changed how the server instances them, one set per workhorse, and the proposals say so in their descriptions and relationship labels. The walkthrough of Agent workbench got new ids: the editor cannot restore a removed walkthrough id, and its steps need an explicit view.
changedNotNamed, decided: Authored instructions (codex-instructions) changed the instruction text and digests, which the part's responsibility already covers. Thread tools (codex-thread-tools) changed only a test. Generation hooks (Codex session) is now named: the epoch starts in the coordinator directory. Archboard server board needs no proposal: codex-wiring.ts workhorsePublisherFor and codex-session-panes.ts are inside its Codex workbench part (a drill-down to Agent workbench), the Codex workbench -> Live panes relationships it draws already cover the new reads of the pane registry, and the per-workhorse news selection is drawn on Agent workbench (Semantic context); the check found no RELATIONSHIP_UNDRAWN there. Command dispatch / Vault finder gained the export checkoutOfVault, which only the Codex workbench on the server uses; the board's question, how a command finds its vault, did not change. Behind: all six boards are clean after adoption; Archboard server, Command dispatch, Skill evaluation, Renderer layout and Semantic renderer stay behind for other tasks' commits.

Review: five reviewers (session store, gateway and projection, runtime and docs, store-gateway boundary, store-coordinator boundary). Fixes: e9309ced8 (the gateway publishes when a pane moves vault, so its dock shows the new checkout's workhorse), b6eaab718 (a workhorse approval terminal waits only for the panes of its checkout), 5bcd383dd (the replay fingerprint of a workhorse tool includes its checkout), eda34bccb and 3919a0799 (a delegation from an ending tab is refused, not left waiting), 923f00008 and facb060e4 (a turn ends on the thread it started on), 8927a0cbc (only New conversation readies the coordinator), 9d838eb46 (duplicate Stop check removed), ce96c9b64 (the refusal of a workhorse tool says what a checkout is and what to do next). Kept by decision: a delegation starts its workhorse before the dispatcher validates the call, because readiness is itself part of that validation. A refused call can at most leave a thread that New conversation would start, which does not justify a new pre-check across the runtime and server boundary. Left to TASK-472.09: a vault outside the <dir>/.archboard/vault layout, reachable through ARCHBOARD_VAULT, gets a workhorse key that checkoutNamedBy never names. Observed, unchanged: one command lease per tab across its checkouts. Proposals adopted in fe32e7b0c (Agent workbench v59, Codex workhorse v31, Voice coordinator v45, Codex session v23, Live panes v38, Command interface v79). Gate: bun run check passed on fe32e7b0c (test:modules 4673 pass, test:system 233 pass, test:repository 27 pass, serial browser lane exit 0).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 02:09
---
Found in the TASK-472.05 review: Fix with Codex now names the diagnosed vault as ARCHBOARD_VAULT on every command (72dc8511c), but the workhorse still runs in the served vault's checkout, so a repair that edits files directly may be outside its sandbox. Make sure that the repair runs in the workhorse of the diagnosed checkout.
---

created: 2026-10-15 03:38
---
Found in the TASK-472.06 boundary review: until this task lands, every Codex thread runs in the archboard checkout the server runs from, and that checkout tracks .archboard/vault. A thread command that omits -C therefore reads and writes archboard's own dogfood boards, and its first such command registers the archboard checkout and all its worktrees in the user's registry, so the navigator lists archboard for every user (confirmed with an isolated ARCHBOARD_REPOS: 'Registered /home/msc/Projects/archboard as the chosen checkout of github.com/miklschmidt/archboard, with 20 of its worktrees'). TASK-472.06 relies on the instructions telling each thread to pass -C and adds no guard, because this task removes the cause: a workhorse runs in its own checkout and the coordinator in a state directory with no vault, where an omitted -C is refused. Add an owner here that a coordinator command without -C is refused with VAULT_NOT_FOUND, and that no thread runs in the archboard checkout unless that is the checkout it works in.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each checkout of a browser tab session has its own Codex workhorse, keyed by tab and checkout, with its own thread link, queue, operations, board-news delivery and approvals. The tab keeps one coordinator, with voice and its tools, which works in a directory of its own under the state directory, holds no vault and reads boards with -C. A typed message reaches the workhorse of its pane's checkout, and a delegation names a checkout and starts its workhorse. Workhorse news and briefs name the checkout. A pane that moves vault is shown its new checkout's workhorse. Verified by the owners named in the notes (codex-workbench-sessions, -thread-links, -approval-sessions, gateway-checkouts, gateway-publication, codex-checkouts, input-fingerprint, codex-workbench-production(-initialization), codex-outside-change), five reviews, and the full gate on fe32e7b0c.
<!-- SECTION:FINAL_SUMMARY:END -->
