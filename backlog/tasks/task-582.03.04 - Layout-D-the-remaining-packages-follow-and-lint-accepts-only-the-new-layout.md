---
id: TASK-582.03.04
title: 'Layout D: the remaining packages follow, and lint accepts only the new layout'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:07:00Z'
updated_date: '2026-11-06T23:50:00Z'
labels: []
dependencies:
  - TASK-582.03.03
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1032000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages without a containment warning still sit role first, and the ratchet and the dual-form lint exist only for the move. Plan: doc-003, step D.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tracked source and test file under an area has exactly one role folder, and it is the last folder of its path
- [ ] #2 The ratchet constant and the old-form lint paths are gone, and the lint rules accept only the new layout
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the trees left in ROLE_FIRST_TREES (ui-kit, workbench-example, code-intel; code-opener, code-binding, server-requests, server-lifecycle and workspace already conform) with scripts/move-source.ts, the default move, one commit each, each module bound to its behavior folder, the tree removed from the ratchet.
2. One commit removes the ratchet and its skip logic, the role-first forms of ui-concern-placement and assistant-ui-imports, and the old-form fixtures (the role-first fixtures stay as refused cases), and updates boundaries.md, frontend.md and ADR 0075.
3. fix(model): for each relationship group with the same source, target and anchor, keep one whose kind and label say what the anchored code does, remove the others.
4. fix(model): Walkthrough pages 44gQ5gUw, from its code.
5. Scans: shared binding keys, duplicate relationships, archboard check warnings, git grep for role-first paths. Each commit: types, archboard check, bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Trees. Only ui-kit, workbench-example and code-intel still broke the rule (a scan of every area file with the ratchet cleared); code-opener, code-binding, server-requests, server-lifecycle and workspace already conform (flat <area>/<role>/<file>).

3a4fc2f98 ui-kit: 31 moves (default move): components/shadcn -> ui/shadcn/components, components/dialog-parts -> ui/dialog-parts/components, state/frame-clock -> ui/frame-clock/state, and its test. components.json aliases name packages/ui-kit/src/ui/shadcn/components; the .oxlintrc vendored-file list follows (exact files, no wildcard). Frame clock binds ui/frame-clock (manifest binding). Hand edits: the shadcn README alias line, the boundaries.md ui-kit paragraph. types pass; archboard check exit 0, 0 warnings; bun run check exit 0, 21/21 (repository 170, modules 4909, system 234, solo 15, browser 49/49).

ebb5fe022 workbench-example: 14 moves: server/{lifecycle,rules}/startup -> server/startup/{lifecycle,rules}, wiring/application -> server/application/wiring, ui/{clients,components,rules}/workbench -> ui/workbench/<role>, tests mirror. 3 relationship anchors follow. The renderer fixture private-entry-parent.json names the moved application.ts. types pass; check 0 warnings; bun run check 21/21 (170, 4909, 234, 15, browser green).

49e86b432 code-intel: 235 moves (default move; git status 39 KB, under the 64 KiB writer limit, so one apply): code-check, code-facts (with each language folder), history-lens and language-servers become behavior folders. Manifest bindings: Code check -> runtime/code-check, Fact analysis -> runtime/code-facts, History lens -> runtime/history-lens (its behavior folder, not history-lens/operations), Language servers -> runtime/language-servers (not language-servers/services); Cached fact reader follows to code-facts/services/reader.ts. 35 vault statements. History lens then owns its Git client, and archboard check warned RELATIONSHIP_UNDRAWN: source-history.ts:194 calls createSourceFacts (Cached fact reader). One claimed intent adds History lens -> Cached fact reader (ID37nw1v, call, 'share one cached fact reader across a repository walk', anchor source-history.ts#createSourceFacts). Hand edits: code-check-route.ts comment, top-port-header-clearance.json (4 paths), boundaries.md code-intel paragraph. The ratchet is empty. types pass; check 0 warnings; embeds current; bun run check 21/21 (170, 4909, 234, 15, browser green).

164dc295e lint: workspace-layout.test.ts loses ROLE_FIRST_TREES, the tree field and the ratchet test, and checks every area file. ui-concern-placement: the role folder must be the folder that holds the file (index === depth - 1), and api must be directly below ui/; the old 'index 0 passes' form is gone and the message no longer names role-first trees. assistant-ui-imports: ROLE_FIRST_OWNERS is gone; the owner is a thread or assistant-runtime folder above the last folder, which must be a role folder. source-layout.ts comment. Fixtures: role-folder-lint.test.ts drops the allowed role-first files and keeps components/thing/Card.tsx, hooks/thing/use-thing.ts and components/thread/Thread.tsx as refused cases, so a rule that accepts the role first again fails; app-boundaries.test.ts state-files-pure drops the role-first state/canvas fixtures (isStateFile unchanged, as doc-003 says). The frame-clock override already held only the new globs (C3b removed the old ones). boundaries.md, frontend.md and ADR 0075 Consequences describe the end state. types pass; check 0 warnings; bun run check 21/21 (repository 169: the ratchet test is gone; modules 4909, system 234, solo 15, browser green).

29456e999 duplicate relationships: a scan keyed by (from, to, anchor) found 24 groups (one of three). One claimed intent keeps one per group and removes 25, read from each anchor (kept <- removed): Generation composition->Codex process hwJPR59O <- 8AmcrRb6, 'start the app-server child its generations run over' (workbench.ts createProcess starts the one child; no thread or voice ownership there). Coordinator tools->Turn execution e1viO4QT <- mhknqBOz, 'delegate, steer, inspect or queue in the named checkout' (tool-execution.ts invokeCheckoutWorkhorse; it starts no workhorse, it refuses without one). Code target->Server requests ygbcyDVT <- FZXXXyDz, 'code-target and opener requests, replies read strictly' (strictReply). Code opener->Read entry oYfZ2qnC <- q1ENQYcO, 'resolve a module's canonical code binding and target' (model-target.ts code:true read). Code opener->Fact analysis ZAbHs2zZ <- 3WdQR8x7, 'the line where a bound symbol is defined'. Realtime voice->Gate protocol operations eRYh0zYO <- TFjDY5zE, 'the realtime leg: thread/realtime/start, append and stop' (negotiation.ts realtimeStart, adapter.ts append/stop). Entry point->Source checkout 6eWsf9T9 <- wImHhbk7 (handOff). Callback delivery->Gate protocol operations 1joDYyhX <- 4DGyP7RO, biUWQZMB (realtime.ts: realtime append, or thread/inject_items for the coordinator; no turn/start there). Architecture context publisher->Archboard announcements yql8mIiB <- at9JRETZ (event; announcements subscribes to what the publisher emits). Code check->Read entry 3hokVf0H <- fVxcoo6Q, 'read the selected canonical states and their predecessor' (states.ts). Code check->History lens m1F0u7X1 <- eW22MD6a, 'read each draft's bound parts at its own ref' (nodesAtOwnRef measures nothing of how far a model is behind). Repository routes->Repository listing aXFI100m <- HbR02k8Z, 'list the repositories and their vaults'. Replay page->Canvas reads r0RVKR0o <- TGkTEPYM, 'read models from the talk, in place of the server', description cleared (it said the page imports a canvas root that re-exports readRetainedFrom; replay-page.ts imports retained-reads.ts directly). Pane composition->Session lifecycle x9gy2EYu <- 5zgh8igv, 'one session per pane, opened in a vault; show a model in it'. Recording tools->Chromium launch BN01aJai <- zSvgwAHH, 'start a private headless Chromium to record or render' (startBrowser), stale description cleared (it named an owner file under lib/). Operation lifecycle->Epoch ledger 2ed6AqSF <- yR5sjMnY, 'stage the operation, then commit or roll it back' (events.ts stageOperation, durable-settlement.ts commit/rollback). Archboard tab adapter->Tab session presence HO533F7P <- 2NPuX9QA, kind dependency -> call (tab-sessions.ts forwards each call to the installed store). Legacy migration->Canonical recovery state tnCVPY3T <- PAre101X, 'write the cutover journal under the held lease' (applyMigration calls writeState of model-state.ts; the journal inspection is activeJournal of model-install.ts, another module). Context announcements->Callback queue Tqxin6z5 <- wyliCZzQ, its description added: each audience gets its own callback on the tab's one queue while voice is live (tellThroughCallbacks). Canonical structure candidate->Archive location b4Ac9wPx <- JVhp6YbR and Canonical subject claims->Archive location VTZKWgse <- TVVWknIf (label 'undefined'), both 'refuse with the shared archive failure'. Host wiring->Voice agent xV2HMQ01 <- hfMj0fMk (createVoiceAgent, start, shutdown). Coordinator thread->Gate uWKB5oF9 <- XAd3chIR, 'thread/start with the coordinator's body and settings'. Thread opening->Gate 7dDHchT9 <- W87z7uEB, 'thread/start with a new workhorse's authored body'. No flow step cites a relationship identity; every walkthrough naming a removed one reads checkpoint 6bc124a8 (the root walkthrough What Archboard does reads state oyXXnyCV and names none). check 0 warnings; embeds current; bun run check 21/21.

97c1065c7 Walkthrough pages 44gQ5gUw removed: its responsibility (the recording page and the replay page Chromium loads) is the code of apps/web/src/ui/walkthroughs/recording and replay, bound by Walkthrough recording fscW90Xt and Walkthrough replay aixSjfNe under Walkthrough recordings; the recorder's side is Page driver (recorder/clients/recording-page.ts). Its parent Walkthrough video binds packages/walkthrough/src/runtime, which holds no page, so it could not be bound there. No relationship, no flow step; its walkthroughs read the retained checkpoint. check 0 warnings; bun run check 21/21.

Final scans at 97c1065c7: no binding key shared by two modules; no relationship group with the same source, target and anchor; archboard check exit 0, 0 warnings, 0 errors; the area-file layout scan finds no file off the rule. git grep for role-first repository paths outside backlog, docs/design, docs/adr and proposals finds only: the generated trees shared/protocol/generated (kept by rule), and synthetic paths that name no file: crates/archboard-scene/src/measure/cards.rs:439, code-intel workspace-imports.test.ts OPEN (code-opener/src/ui/clients/code-target/open.ts, a temp-checkout fixture), the retired semantic-board routes in top-port-header-clearance.json, and the refused role-first fixtures of role-folder-lint.test.ts. Criteria left unchecked for the reviewer and parent.
<!-- SECTION:NOTES:END -->
