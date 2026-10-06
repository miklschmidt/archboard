---
id: TASK-368.05
title: Flat dogfood module boards draw their modules as containers
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:46'
labels:
  - interfaces
  - architecture
dependencies:
  - TASK-368.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: docs
ordinal: 641000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-09-29, 9 of the 15 dogfood boards drew no container. Not every board has a module seam to draw, but the module boards that describe one `src/<area>/<module>` do.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each board without a container either draws its modules as containers through an adopted proposal, or its task notes say why it has no module seam
- [ ] #2 Relationships that crossed into another module's private file now land on that module's entry points, or the notes say why the code really does that
- [ ] #3 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected boards: the 8 current variants that draw no container (measured 2026-10-06 with semantic show): Archboard, Archboard server, Codex workhorse, Command dispatch, Command interface, Renderer layout, Semantic renderer, Skill evaluation. Board persistence drew its container on TASK-368.04.

Boards with a module seam, one proposal each, named TASK-368.05:
1. Command dispatch@TASK-368.05: container Command routing bound to src/cli/command-routing; the 7 parts under its lib/ inside. Command catalogue (commands/run.ts) calls runCliWith and registryOf through index.ts, so those two become entry points; no relationship moves.
2. Skill evaluation@TASK-368.05: container Evaluation harness bound to src/runtime/skill-evaluation; the parts under its lib/ inside. Eval CLI (scripts/evaluate-skill.ts) calls loadSuite, runBatch, gradeBatch and writeReport through index.ts, implemented in suite.ts, batch.ts, grading-run.ts and records.ts, so the existing edges land on entry points; no relationship moves. Give the board its scope summary (it has none).
3. Semantic renderer@TASK-368.05: container Renderer core bound to src/transformers/semantic-renderer with its 12 parts inside; Bun host (src/runtime/semantic-renderer), Browser application, Archboard server and Host canvas stay outside. Bun host and the browser renderer call renderBoard (board.ts) and installRendererHost (root host.ts re-exports lib/host.ts), so Board answer and Renderer host become entry points; no relationship moves.
4. Renderer layout@TASK-368.05: the same Renderer core container around its 11 bound parts; Pretext, Host canvas, Graphviz and libavoid stay outside. The board draws no caller of the core, so every child is a hidden part (ADR 0044 allows this and says so).
5. Codex workhorse@TASK-368.05: the board draws each module whole as a card bound to its root file; the one crossing is Workhorse start -> Tell coordinator (lib/tell-coordinator.ts). workhorse-start/lib/model.ts imports the two constants through the codex-coordinator-callbacks root, so draw container Coordinator callbacks bound to src/runtime/codex-coordinator-callbacks with Tell coordinator inside as its entry point.
6. Archboard server@TASK-368.05 (last: TASK-369.02 will branch here): container Archboard server bound to src/server/archboard with the 17 parts bound under its lib/ inside. HTTP callers land on the routes they request; Board lease -> Board announcements is the onBoardLockChanged subscription. No relationship moves.
7. Command interface@TASK-368.05 (last, same reason): containers Command contract (src/cli/command-contract: Bootstrap, Status, Contract execution, and a new entry point runCommand bound to runner.ts) and Commands (src/cli/commands: the command files and the catalogue). Move Command routing -> Contract execution onto runCommand (session.ts:75 calls runCommand; runner.ts calls executeCommand) and add runCommand -> Contract execution.

Board without a module seam: Archboard (system level; its parts are processes and stores, not src modules). Notes say why, and why its two datastores bind to private owner files.

For each proposal: claim, branch from current with --expect-version, restate moved nodes whole with parent, semantic inspect --container, semantic compare, rasterize and look, set the scope summary, adopt, release, commit the board file and this task by path. Finally ./bin/dogfood check reports no diagnostics.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Command dispatch@TASK-368.05 (branched from Current architecture at v7, adopted at v11).
- Container: Command routing (module), bound to src/cli/command-routing. Its 7 parts bound under lib/ are its children; every id kept.
- semantic inspect --container 'Command routing': 2 entry points (runCliWith, Registry and surface), 5 hidden parts (Global flag readers, dispatchedCommand, Interruptible run, Failure reporting, Help text), 1 caller (Command catalogue), 3 outgoing (to runCommand and Server client twice), 0 pass-through.
- Evidence: src/cli/commands/run.ts imports runCliWith and registryOf through command-routing/index.ts and calls them at run.ts:151 (runCli) and :133 (cliContractRegistry). index.ts re-exports them from lib/session.ts and lib/registry.ts, the files the two parts bind. No relationship moved.
- Differences from index.ts: run.ts also calls cliSurfaceOf (:125) and helpText (:142), from cliSurface and commandHelp, which nothing in src, scripts, tools or tests calls. So the board draws no relationship for them. TASK-368.10 owns reporting exposed names that nothing reaches. contract and child (lib/route.ts) build the command table and are not drawn.
- Compare: one interface change (Command routing gains runCliWith and Registry and surface, caller Command catalogue), the container added, 7 parents changed, no relationship changed.
- Picture: 1549x953 against 1604x853. The catalogue enters the container from the top right; runCommand and Server client sit outside it. Labels legible.

Skill evaluation@TASK-368.05 (branched from Initial at v9, adopted at v12).
- Container: Evaluation harness (module), bound to src/runtime/skill-evaluation. The 21 parts bound under its lib/ are its children; every id kept. Eval CLI (scripts/evaluate-skill.ts), Evaluation inputs (evals), Agent CLI, Archboard server, Codex CLI and Claude CLI stay outside.
- semantic inspect --container 'Evaluation harness': 4 entry points (Suite loader, Batch orchestrator, Grading session, Report), 17 hidden parts, 1 caller (Eval CLI), 6 outgoing (to Evaluation inputs, Codex CLI twice, Claude CLI, Archboard server, Agent CLI), 0 pass-through.
- Evidence: scripts/evaluate-skill.ts imports through skill-evaluation/index.ts and calls loadSuite (:135, lib/suite.ts), runBatch (:238, lib/batch.ts), gradeBatch (:269, lib/grading-run.ts) and writeReport (:285 and :311, lib/records.ts). These are the files the four entry points bind, so no relationship moved.
- Differences from index.ts: the script also calls resumeSelection (:186), which lives in batch.ts, the Batch orchestrator entry point, as part of run. It also calls pinVersions (:293, lib/pin-versions.ts) for the pin subcommand and executableVersion (lib/version.ts). No part draws those two, because the board's question is how a batch is run, graded and reported. Repinning is outside that scope. The script is the only file outside the module that imports it. index.ts exports many more names, which only the module's own tests use. TASK-368.10 owns reporting them.
- The board had no summary. It now carries 'Service level: the harness that measures the consumer skill, the four entry points the eval CLI reaches, and the runs, grading and report behind them. Follow linked subjects for related levels.'
- Compare: one interface change (Evaluation harness gains the 4 entry points and the caller Eval CLI), the container added, 21 parents changed, all 37 relationships unchanged.
- Picture: 3860x1729 against 3438x1813. The container holds everything but the CLI and the externals, and the Grading region sits inside it. Eval CLI enters at the top left, and the outgoing lines leave right and down to the CLIs and the server.

Correction to the Skill evaluation note: the script does not call executableVersion itself. It passes the function to pinVersions as versionOf (:295), so executableVersion is part of the pin subcommand as well.

Semantic renderer@TASK-368.05 (branched from ADR 0040 at v23, adopted at v26).
- Container: Renderer core (module), bound to src/transformers/semantic-renderer, the name its Bun wrapper gives it (src/runtime/semantic-renderer/index.ts:1). Its 12 parts are its children: the ones bound to its root files index.ts and board.ts, and those under lib/. Every id kept. Archboard server, Bun host (src/runtime/semantic-renderer, drawn whole), Browser application and Host canvas stay outside.
- semantic inspect --container 'Renderer core': 2 entry points (Board answer and Renderer host, each reached by Bun host and Browser application), 10 hidden parts, 2 callers, 1 outgoing (Measured text -> Host canvas), 1 pass-through (Board answer).
- Evidence. Bun host calls renderBoard of board.ts at runtime/semantic-renderer/index.ts:65, and installRendererHost through the root host.ts at lib/bun-host.ts:99. The browser renderer calls both at ui/browser-renderer/index.ts:98 and :69. host.ts re-exports installRendererHost from lib/host.ts, the file Renderer host binds. No relationship moved.
- Pass-through: Board answer receives two calls and sends one, all of kind call, so the shape asks the deletion-test question. The code answers it: renderBoard chooses the variant, view, comparison and unsettled marks from shared/semantic-board helpers (board.ts:1-30) that this board does not draw. ADR 0044 reports this as information, never as a fault, so it stays as drawn.
- Differences from what the core exposes: index.ts, engine.ts, engine-pool.ts, measurement.ts and layout.ts are also root files. Their callers (layout workers, the canvas tooltips, the measurement wrapper) are outside this board's question, so no part draws them.
- Summary: 'Module level: the renderer core, the entry points its two hosts reach, and how meaning becomes SVG and interaction geometry behind them. Follow linked subjects for related levels.'
- Compare: one interface change (Renderer core gains Board answer and Renderer host, and the callers Bun host and Browser application), 1 node added, 12 parents changed, all 25 relationships unchanged.
- Picture: 2332x1570 against 1889x1561. The hosts sit to the right of the container and enter at its top. Host canvas sits outside at the bottom right. Labels legible.

Renderer layout@TASK-368.05 (branched from ADR 0040 at v23, adopted at v26).
- Container: Renderer core (module), bound to src/transformers/semantic-renderer, with the same name and binding as on Semantic renderer. All 11 bound parts are its children; every id kept. Pretext, Host canvas, Graphviz and libavoid stay outside.
- semantic inspect --container 'Renderer core': 0 entry points, 11 hidden parts, 0 callers, 4 outgoing (Measured text -> Pretext and Host canvas, Card blocks -> Graphviz, Trunk router -> libavoid), 0 pass-through.
- Decision: no caller is drawn. The board's question is how one drawing settles inside the core. Its callers (Bun host and the browser renderer through board.ts and host.ts) are drawn on Semantic renderer, where View dispatcher links. ADR 0044 reads a container with no caller as 'the board draws no caller', not as the deepest module. So the container is drawn for what this board can say: where the core ends and which outside libraries it reaches. Adding the hosts would repeat Semantic renderer's parts on a second board.
- The board had no crossing into another module's private file, so no relationship moved.
- Summary: 'Module level: how the renderer core settles one drawing, and by what measure; the libraries and the canvas it reaches stay outside it. Follow linked subjects for related levels.'
- Compare: Renderer core is a container only on the proposal (holdsParts variant true, against false), with no entry points and no callers. 1 node added, 11 parents changed, all 16 relationships unchanged.
- Picture: 1842x1579 against 1633x1371. The container holds the whole pipeline, with View dispatcher at its top. Pretext and Host canvas sit to the right, Graphviz at the bottom right, libavoid below. Labels legible.

Codex workhorse@TASK-368.05 (branched from TASK-373 at v13, adopted at v16).
- The board draws each module whole, as a card bound to its root index.ts, so every caller lands on that module's root file. Those cards need no container: a card bound to the root is the module drawn whole. The one crossing into a private file was Workhorse start -> Tell coordinator, which is bound to codex-coordinator-callbacks/lib/tell-coordinator.ts.
- Container: Coordinator callbacks (module, group voice), bound to src/runtime/codex-coordinator-callbacks, with Tell coordinator as its one child (id kept). It is in voice because the module serves the voice coordinator, as Coordinator tools does.
- Evidence: codex-workhorse-start/lib/model.ts:3-6 imports ARCHBOARD_COORDINATOR_MANIFEST_SHA256 and ARCHBOARD_COORDINATOR_NAMESPACE through the module root. index.ts re-exports both from lib/tell-coordinator.ts. model.ts uses them at :32 (manifest digest) and :56 (dynamic tool namespaces). So the existing dependency lands on the entry point that implements what the caller names, and no relationship moved.
- semantic inspect --container 'Coordinator callbacks': 1 entry point (Tell coordinator, reached by Workhorse start), 0 hidden parts, 1 caller, 0 outgoing, 0 pass-through. The board draws no other part of the module. Its callback queue and delivery are on Voice coordinator, where Tell coordinator links.
- Decision: not to rebind Tell coordinator to the module root. Its responsibility is the tool alone, and the binding names the file that owns it (evidence rule 2).
- Summary: 'Module level: the workhorse thread, its queue, and the coordinator's door; each module is drawn whole except the coordinator callbacks, whose tool is the entry point the workhorse start names. Follow linked subjects for related levels.'
- Compare: one interface change (Coordinator callbacks gains Tell coordinator and the caller Workhorse start), 1 node added, 1 parent changed, all 17 relationships unchanged.
- Picture: 2927x1197 against 2276x1337. The container sits inside the Voice region beside Coordinator tools, and the dotted 'archboard_coordinator, by digest' line from Workhorse start enters it to reach Tell coordinator. Labels legible.

Archboard server@TASK-368.05 (branched from TASK-373 at v21, adopted at v24). Another task's draft, TASK-369.02, was already open here, branched from TASK-373. TASK-373 is now historical, so that draft's adoption needs the archboard-dev PARENT_SUPERSEDED step.
- Container: Archboard server (kind service, as other boards draw it), bound to src/server/archboard. The 17 parts bound under its lib/ are its children; every id kept. Agent CLI, Browser, Semantic board store, Semantic renderer, Code opener (src/server/code-opener) and Board lease (src/runtime/engine/board-lock.ts, a root file of engine) stay outside.
- semantic inspect --container 'Archboard server': 9 entry points, 8 hidden parts, 3 callers (Agent CLI, Browser, Board lease), 11 outgoing, 0 pass-through.
  - Entry points: Board routes, Board write routes, Claim routes, Rename route, Discard route, Service routes, Pane routes, Pane socket, Board announcements.
  - Hidden parts: HTTP application, Application lifetime, Mutation admission, Pane registry, Disk change watcher, Codex workbench, Change feed, Tab session presence.
- Why no relationship moved: the CLI and the browser cross no import. They send HTTP requests and open one WebSocket per page, so each lands on the route or socket that handles it. That is the 'handled route' form of an entry point in evidence rule 3. Board lease -> Board announcements is the onBoardLockChanged subscription that board-announcements.ts imports from engine/board-lock.ts (a root file) at :10. The lease emits the event and the server handles it, so Board announcements is an entry point by subscription.
- The board's 11 measured crossings into src/server/archboard/lib (10 HTTP or socket calls and the lease event) now end on entry points of the container.
- Code opener is drawn whole as a card bound to its directory. HTTP application mounts it, and it calls the store, so it stays outside as another server module.
- Summary: 'Service level: the Archboard server module, the routes and socket its callers reach, the one write boundary behind them, and the modules it calls outside itself. Follow linked subjects for related levels.'
- Compare: one interface change (Archboard server gains the 9 entry points and the 3 callers), 1 node added, 17 parents changed, all 52 relationships unchanged.
- Picture: 4767x3231 against 4028x3043. The container fills the board, and Agent CLI and Browser enter from the right edge. The store, the lease and the renderer sit outside in their own Board writes and Drawing regions, so those groups now draw one region inside the container and one outside, the renderer's one region per container. Crossing density is about what the current variant shows. No view needed an edit.

Command interface@TASK-368.05 (branched from TASK-381 at v15, adopted at v18). Another task's draft, TASK-369.02, was already open here, branched from TASK-381. TASK-381 is now historical, so that draft's adoption needs the archboard-dev PARENT_SUPERSEDED step.
- Container 1: Command contract (module), bound to src/cli/command-contract. Its children are Bootstrap (bootstrap.ts), Status (status.ts), Contract execution (lib/execution.ts) and a new entry point runCommand (function, runner.ts).
- Container 2: Commands (module), bound to src/cli/commands. Its children are the 16 parts bound to its root files: Command catalogue (run.ts) and the 15 command families.
- Outside: Entry point (src/bin.ts), Command routing (drawn whole, links to Command dispatch), Board client, Server client, Board rasterizer, Walkthrough recorder, Archboard server. Every existing id kept.
- Moved: Command routing -> Contract execution (jKqNz2j3) now ends on runCommand, keeping its id, label, hero emphasis and traffic. Added: runCommand -> Contract execution, call 'executeCommand', hero with the same traffic, because it is on the same spine.
- Evidence: command-routing/lib/session.ts:12 imports runCommand from the root file runner.ts and calls it at :75. runner.ts:2 imports the private executeCommand and calls it at :16. bin.ts runs applyCliBootstrap from bootstrap.ts (:18-19) and runCli from commands/run.ts (:30-31), both root files, so those two edges already landed on entry points.
- The view 'One command's path' selected Command routing and Contract execution. It now also selects runCommand, or the moved call would drop out of the view. Views belong to the board, so this is the one view edit.
- semantic inspect --container 'Command contract': 2 entry points (Bootstrap and runCommand), 2 hidden parts (Contract execution, Status), 2 callers (Command routing, Entry point), 17 outgoing, 1 pass-through (runCommand). The code agrees: runner.ts's body is the one call to executeCommand, and its comment calls it the module's public entry point.
- semantic inspect --container 'Commands': 16 entry points, 0 hidden parts, 2 callers (Entry point, Contract execution), 16 outgoing. Every command file sits at the module root, and Contract execution calls each contract's handler through the contract value, so every child is an entry point. 12 of them read as pass-through by shape: each takes the validated input and sends one call to Board client or Server client. That is information, not a fault. Each handler shapes the request and presents its answer, which this service-level board does not draw.
- Summary: 'Service level: the CLI application's modules, the entry points one command passes through, and its command groups. Not separate deployed services. Follow linked subjects for related levels.'
- Compare: interface changes for both containers (Command contract gains Bootstrap and runCommand, with callers Command routing and Entry point; Commands gains its 16 entry points, with callers Entry point and Contract execution). 3 nodes added, 19 parents changed, 1 relationship changed (to: Contract execution -> runCommand), 1 added, 40 unchanged.
- Picture: the full board draws 7210x1993 against 3431x2598. The renderer lays the Commands container's 16 children in one row under Contract execution's fan-out, so the board is now wide and short. That is a layout outcome of correct meaning, and the board was not bent to change it (ADR 0023). The view 'One command's path' draws 1651x1695: Commands, Command routing and Command contract read in order, with runCommand -> Contract execution inside the contract. 'What the CLI can be asked' draws 4802x1413, against 6365x834 before. Labels are legible in each picture.

Archboard: no module seam. It is the system board. Its parts are the processes that run (Agent CLI, Archboard server, Browser, Skill evaluation, Codex app-server, Headless Chromium, ffmpeg) and what they keep (Board vault, Repository checkout, Codex home, Recorded talks). It is not a src/<area>/<module>. Each process card links down to the board that draws its modules as containers, so no container is drawn and no proposal was branched.
- Its 3 measured crossings are kept on purpose. Archboard server -> Codex home, Codex app-server -> Codex home and Agent CLI -> Recorded talks are data relationships from a process to a store on disk, not imports. The store cards bind to the file that owns where the store lives and its format (codex-process/lib/storage.ts, walkthrough-recorder/lib/talk-files.ts), following evidence rule 2. Codex app-server is another program, which reads its home directly. Rebinding the stores to a module root would name a file that does not own them.
<!-- SECTION:NOTES:END -->
