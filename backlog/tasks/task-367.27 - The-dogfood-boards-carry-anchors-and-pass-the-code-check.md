---
id: TASK-367.27
title: The dogfood boards carry anchors and pass the code check
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 16:53'
labels:
  - code-check
  - architecture
dependencies:
  - TASK-367.07
  - TASK-367.26
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: docs
ordinal: 635000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dogfood vault is how the next agent learns this repository. Its relationships have no anchors yet, and the check needs anchors to say more than which files changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every relationship between bound parts on the current dogfood boards carries an anchor
- [x] #2 `./bin/dogfood check --code` reports no finding, or each remaining one is fixed on the board or explained in the task notes
- [x] #3 `.archboard/README.md` tells a maintainer to run the code check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Three agents share the task. Group A (this record's writer): Archboard, Command interface, Command dispatch, Skill evaluation, Board persistence, plus the vault configuration's evidence key, the README line and this record. Group B: Archboard server, Agent workbench, Codex session, Codex workhorse, Voice coordinator. Group C: Browser application, Board viewer, Board rasterizer, Renderer layout, Semantic renderer. Groups B and C report their notes to the parent.
1. Vault configuration: each relationship kind names the evidence kinds of the default vocabulary (ADR 0046): call and render [call]; http, rpc, event, queue, data [call, configured-path]; dependency [call, configured-path, import, build-dependency]; other no key. Committed first so every group reads the same vocabulary.
2. .archboard/README.md tells a maintainer to run ./bin/dogfood check --code after board work and at a task's closing (criterion 3).
3. Per board, a proposal named TASK-367.27 (Archboard@TASK-367.27, Command interface@TASK-367.27, Command dispatch@TASK-367.27, Skill evaluation@TASK-367.27, Board persistence@TASK-367.27): every relationship between bound parts gets an anchor read from the source; a part bound to an index.ts that only re-exports is rebound to the file or directory that does the work; two parts bound to one file get a symbol each; each RELATIONSHIP_UNDRAWN is drawn with its anchor when the board's question needs it, else explained here; backwards and unsupported ones are anchored or have their kind or direction fixed. No subject id is renamed.
4. Closing per archboard-dev: check --code --variant TASK-367.27 and the diff recipe, summary = the board's scope, adopt (restate on PARENT_SUPERSEDED), ./bin/dogfood check, commit each board.
5. Restart the dogfood server, run ./bin/dogfood check --code, and record every remaining finding on these boards with its explanation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Group A progress (2026-10-06).
Vault configuration (8b7598dd0): every relationship kind carries the evidence key of the default vocabulary (call, render: call; http, rpc, event, queue, data: call, configured-path; dependency: call, configured-path, import, build-dependency; other: no key). The dogfood kinds are the default kinds, so no adaptation was needed. README (41d33fd18): the maintenance section tells a maintainer to run ./bin/dogfood check --code after board work and at closing, and what it finds.
No code commit belongs to this task, so the footprint step (closing step 3) has no range to read; each proposal was read with check --code --variant TASK-367.27 and semantic compare instead.
Command dispatch (894dc110c, adopted v15): 11 relationships anchored. Interruptible run binds session.ts#runInterruptibleCommand, because runCliWith binds the same file: the check gave its uses to whichever part it met, which made 6 of the 8 undrawn warnings and the ends-overlap skip. Drawn: Command catalogue -> Help text (run.ts helpText) and Command catalogue -> Command routing (run.ts contract, the route builder in route.ts that no child binds). Help text is now an entry point, so the summary says three entry points. Remaining: EXPOSED_UNUSED on Command routing (6 exposed names nothing outside uses; a code change, outside this task).
Board persistence (b1861dddc, adopted v34): all 36 relationships anchored. Write under lease -> Lifecycle transitions is anchored on write.ts apply (command.transition.apply, a call through the transition value it receives), which clears the unsupported finding. Drawn with anchors: the seven parts that call Address and locate (diagnostics, drill-down, former-names, listing, read, relocation, rename), Vault diagnostics -> Read and validate and -> Vault configuration, Adopt, Settle and Shelve -> Propagate descendant edits, Adopt -> Shelve (data: adopt.ts reads shelve's BRANCH_INSTEAD advice), and Board lease -> Archboard server (event, board-announcements.ts onBoardLockChanged). Remaining: EXPOSED_UNUSED on Board store (19 names; code, outside this task).
Archboard (02b6e8b95, adopted v27): all 16 relationships anchored, including those with an unbound end (fetch in server-client-transport.ts and in ui/server-requests, broadcast, spawnChromium, Bun.spawn of ffmpeg, buildCodexChildEnvironment for Codex's home and its board commands). Archboard server now binds src/server/archboard (its index.ts only re-exports) and Skill evaluation binds src/runtime/skill-evaluation (the harness that starts the CLI and the server; the script is its thin entry). Drawn: Skill evaluation -> Recorded talks (replay.ts readTalk). Remaining: none.
Skill evaluation (2317c224b, adopted v15): all 37 relationships anchored; Agent CLI -> Archboard server uses the same fetch anchor as on Archboard. Drawn: 10 relationships for the 7 undrawn warnings (Report -> Batch orchestrator, Codex grader -> Run isolation and -> Command classifier, Guardrails -> Command classifier, Batch orchestrator and Grading session -> Skill install, Grading session and Comparison -> Skill citations, Outcome checks -> Suite loader, Eval CLI -> Evaluation harness for pinVersions in the harness's own code). Remaining: EXPOSED_UNUSED on Evaluation harness (214 names the barrel exposes for tests; code, outside this task).

Command interface (c6b0e960d, adopted v42): all 60 relationships anchored. The 18 Contract execution -> <command> relationships share the anchor execution.ts handler (contract.handler(...), dispatch through the contract it is handed); it proves the mechanism, not which command. Server client -> Archboard server uses fetch in server-client-transport.ts, the same anchor as Agent CLI -> Archboard server on Archboard and Skill evaluation. Command routing binds src/cli/command-routing (its index.ts only re-exports). Command catalogue (run.ts) moved out of the Commands container to stand beside it, so one relationship Command catalogue -> Commands (a contract per command) covers the 17 commands, in place of 17 fan-out edges; Command dispatch already draws the catalogue as its own part. Added parts: Server launcher (src/runtime/engine/spawn.ts) and Prerequisites (command-contract/lib/prerequisites.ts, inside Command contract). Runtime control -> Server launcher (was -> Archboard server, same id) and Contract execution -> Prerequisites (was -> Archboard server, same id, label 'ensure what the command needs'), because ensureServerRunning and stopServer live in spawn.ts, which no part bound, so no anchor could hold before. Drawn: Command catalogue -> Commands and -> Status, Commands -> Command contract, -> Board client and -> Server client, Command contract -> Command catalogue (artifacts.ts cliContractRegistry, the registry the CLI audit generator reads), Command routing -> Command contract and -> Bootstrap, Prerequisites -> Server launcher and -> Server client, Server launcher -> Archboard server and -> Server client, Status -> Server launcher. Remaining: EXPOSED_UNUSED on Command contract (48 names) and on Commands (114 names); code, outside this task.
Final run, after ./bin/dogfood stop && start: every relationship on the five group A boards carries an anchor (17 + 60 + 13 + 47 + 50, none unanchored). ./bin/dogfood check --code reports on these boards only five EXPOSED_UNUSED information findings: Board store, Command routing, Command contract, Commands and Evaluation harness. Each lists exported names that no file outside the module uses (most are exported for tests or for the barrel); the repair is to stop exporting them, a code change outside this task's fence, and no board change clears it. No skip names these boards. Whole vault at that moment: 31 RELATIONSHIP_UNDRAWN, 131 RELATIONSHIP_UNSUPPORTED, 5 RELATIONSHIP_BACKWARDS, 6 CALLER_UNDRAWN, 13 EXPOSED_UNUSED, all on groups B and C boards apart from the five above. Gate: ./bin/dogfood check no diagnostics; bun run test:repository 20 pass 0 fail; oxfmt --check on .archboard/README.md and the configuration passes.

Group B did Archboard server, Agent workbench, Codex session, Codex workhorse and Voice coordinator on 2026-10-06. Every relationship on these boards carries an anchor (221 relationships). The commits are 94c93598f, 22506c2c1, 5c920152e, 013a2702b, 4a2fa8aaf and 3a7157874.

Most parts bound to an index.ts that only re-exports now bind their module directory. Codex session gained 5 relationships, Agent workbench 8, Codex workhorse 7, Voice coordinator 5 and Archboard server 17. Archboard server gained two parts: HTTP listener (lib/server-app.ts), because the listener lives there and not in either end of the old relationship, and Server entry (src/server.ts), which starts Application lifetime. Two anchors were corrected: remember became createCodeFindingsMemory, and createCodeFacts became findSymbol. On Voice coordinator, the label of Realtime voice -> Spoken approval now reads "the user's spoken reply, as transcript events", because nothing in src calls the gate's arm (gate.ts:281); only its tests do.

The remaining warnings are each read against their line. They are uses of a constant, a type guard, an error class or a shape helper, which the board does not draw as a dependency:
- Codex session: CODEX_SESSION_THREAD_SOURCE (model.ts:23), requestParams, and an instanceof CodexTransportRemoteError test.
- Agent workbench: ARCHBOARD_COORDINATOR_MANIFEST_SHA256, hashed into the workhorse profile.
- Codex workhorse: ADDITIONAL_CONTEXT_POLICY, assertCanonicalInstructionBytes and createTextUserInput on Authored instructions.
- Voice coordinator: a shared schema on Tool contract, input builders on Authored instructions, and container code whose call is drawn as Callback delivery -> Codex session.
- Archboard server: codex-semantic-input.ts reads the board and the claim for the agent's brief, Service routes count boards and clients for /health, aggregateOf parses a key, settledChangeFields builds a broadcast, and Server entry calls serverStartupFailureMessage.
EXPOSED_UNUSED (information) also remains on each board's containers.

Group C did Browser application, Board viewer, Board rasterizer, Renderer layout and Semantic renderer on 2026-10-06. Every relationship between bound parts on these boards carries an anchor. The commits are c155d1552, c35ae00ab, 3ed1df153, 3e78aa510 and 1a2c8c782.

Renderer layout (v33) gained 17 anchors and two relationships: Block placement -> Trunk router, and Architecture painter -> Measured text. One finding remains, EXPOSED_UNUSED on Renderer core. It is information about the code.

Semantic renderer (v30): Bun host now binds src/runtime/semantic-renderer. A new part, Engine pool, sits inside Renderer core and binds engine-pool.ts. Nine anchored relationships were drawn. Theme palette -> Renderer host became SVG document -> Renderer host, because theme.ts never calls the host. View dispatcher, Measured text and Engine pool became entry points, which cleared both CALLER_UNDRAWN warnings. EXPOSED_UNUSED on Renderer core remains.

Board rasterizer (v32): Frame renderer now binds walkthrough-recorder/lib/render.ts. Walkthrough recorder and Recording page bind their directories. Three relationships were drawn. Frame renderer -> Chromium executable moved to Frame renderer -> Walkthrough recorder, because tools.ts defines startBrowser. Two undrawn warnings remain, each read against its line:
- DevTools connection: Chromium executable and Page readiness use only the isJsonRecord guard that devtools.ts exports. Neither one talks over the connection.
- Headless browser: three parts only catch or throw HeadlessChromiumError from lib/errors.ts, which no child binds. The board draws their calls into the children.
EXPOSED_UNUSED on Headless browser also remains.

Browser application (v42): Browser client binds src/ui, and eleven module parts bind their directories instead of their index. Walkthrough replay -> Voice subtitles became Walkthrough replay -> Workbench client, because the replay renders VoiceBox. Four relationships were drawn. No finding remains. One exposure-unknown skip remains, because src/ui has no root file.

Board viewer (v63): Render stage states binds components/. Control camera binds hooks/use-board-camera.ts. Walkthrough replay binds its directory. Three relationships were drawn, four corrected, and two removed, because no code makes them. These warnings remain, each read against its line:
- Semantic viewer <- Browser client and Walkthrough replay: the uses are address parsing and overlay placement, not a read of the board.
- Fetch semantic reads <- Render stage states and Local pictures: the uses are the SemanticBoardError class only.
- Drive walkthrough focus, Refresh changed boards, Camera glide, Frame clock and Trace what a part reaches: each use goes through a path the board already draws, or is a detail below its grain.
- CALLER_UNDRAWN on Picture source, Picture cache and Local pictures: frontend/main.tsx wires them once at page start, and the board begins at a mounted pane.
- CALLER_UNDRAWN on Semantic queries: the catalog and the diagnostics share the query cache, and the board is about one pane.
EXPOSED_UNUSED on Semantic viewer (63 of 89 names) also remains. Six anchors name a symbol that their own file defines, and three cite a helper hook that no part binds. The check allows these but does not judge them.

Layout after adoption: every board lays out under 1 s. Board viewer took 657 ms on a restarted server, with a peak of 912 ms during the proposals.

Parent verification on 2026-10-06: across the 15 current boards, 599 relationships join two bound parts and none lacks an anchor. After a server restart, ./bin/dogfood check reports no diagnostics, and ./bin/dogfood check --code reports 22 RELATIONSHIP_UNDRAWN and 4 CALLER_UNDRAWN warnings, 13 EXPOSED_UNUSED information findings, and the skips exposure-unknown (src/ui) and text-only. Each remaining warning is explained above by its group. They are uses of constants, error classes, guards and helpers that the boards do not draw as dependencies.

Layout regression on Archboard server (2026-10-06, after group B). Group B's 17 relationships and two parts (4a2fa8aaf, 3a7157874) made the board's first layout about three times slower, and wide-boards.test.ts "Archboard server (track)" failed its 3 s bound.

Measured, same run, at a load of 5 to 8 (first layout of the variant, warm engine): the board at 9c4018633 took about 650 ms without the vault policy (what timing.ts measures) and about 1.4 s with it (what the wide-boards test measures). The board before this fix took about 1.7 s and 4.3 s. No one relationship carried the cost: removing any single one of the 21 added saved 0 to 30%, and removing all of them made it slower (Graphviz then also weighed wraps, 15 lays instead of 3). A profile of the Track solve showed the cost per lay had grown about 2.8 times: Graphviz, the lane searches in straighten and relay, and partCollinear in track/parting.ts, which counted collinear and swapped pairs over every net of the drawing for each pair and each move it tried.

Renderer (b70da30a5): parting weighs only nets of one channel, which is the only place a pair can read as one or swap sides. Every drawing is byte-identical: 252 variants of the tracked vault in both engines, and the wide-board fixtures. Archboard server took about 30% less.

Board (51b44717b, adopted as 'TASK-367.27 layout after TASK-368.11'; the first two proposals were shelved when TASK-367.12 review and then TASK-368.11 were adopted after them):
- Merged: Tab session presence -> Codex workbench ('end a tab gone for 60 s') into Codex workbench -> Tab session presence, now 'a pane's tab, and the end of a tab gone for 60 s'. Both were calls that codex-wiring.ts makes into tab-sessions.ts: tabSessionOf, and endTabSessionsOnceGone, which subscribes to a tab's end. The walkthrough beat 'A tab keeps its conversation' names the one relationship.
- No longer drawn, each a use below the board's grain, now an undrawn warning:
  - Semantic renderer <- HTTP application: application.ts calls diagramIconPaths for the icon route. Board routes -> Semantic renderer draws the server's use of the renderer.
  - Application lifetime <- Service routes: /health reports serverPhase, as it reports board and client counts (already explained).
  - Semantic board store <- Pane registry: listSemanticBoards picks a new pane's first board.
  - Disk change watcher <- HTTP application and Pane routes: application.ts starts the watch at load, and arrivedOnBoard takes the file's baseline (noteBoardShown). The watch's announcements (Disk change watcher -> Pane registry) and the lease sweep that drives it (Board lease -> Disk change watcher) stay drawn.
  - Pane registry <- Codex workbench: boardForPane, a lookup the workbench makes for a pane's context. Pane routes -> Codex workbench draws how a pane's focus reaches the agent.
  - Codex workbench <- Rename route: a renamed pane's focus is published the same way (publishPaneContext). Rename route -> Pane routes and Pane routes -> Codex workbench draw the moved pane's arrival.
  - Board announcements <- Discard route: the discarder's doing, through announceDoing, as Board write routes -> Board announcements draws for every write.
- Kept and still anchored: the other 82 relationships. Every `>` line of the closing-step-1 diff is one of the removals above; no other finding moved.

After: at a load of 6, without policy 0.9 s and with policy 2.3 s (both renderers changed: board alone 1.1 s and 2.8 s, renderer alone 1.2 s and 3.4 s). timing.ts at a load of 14: Archboard server 803 ms (it was 1,652 ms at a load of 15); slowest Skill evaluation 844 ms. bun test --isolate wide-boards.test.ts: 36 pass, 0 fail, at a load of 7 to 14.

Footprint against c611b5ffa (the parent of b70da30a5): current is the proposal's parent; nothing namedAndChanged; every namedNotChanged part is named only by a removed or changed relationship. changedNotNamed lists Archboard server, Code check, Code facts and Language servers, changed only by TASK-367.14, .18 and .19 commits in the range. Behind: b70da30a5 puts Renderer core behind on Renderer layout and Semantic renderer; both boards stay right, since the change is inside the parting pass and draws the same pictures.

./bin/dogfood check: no diagnostics. ./bin/dogfood check --code on Archboard server: 10 RELATIONSHIP_UNDRAWN warnings (the five group B explained, now with Pane registry on Semantic board store and Codex workbench on Pane registry, plus Application lifetime, Semantic renderer, Disk change watcher, Codex workbench and Board announcements, each explained above) and EXPOSED_UNUSED on the container.

What remains: the picture is still dense (82 relationships, most of them into the Live panes region). The honest way to fewer lines is a drill-down board for the live panes (Pane routes, Pane socket, Pane registry, Board announcements, Change feed, Tab session presence, Disk change watcher), which was outside this fix. With the policy, the first layout is still about 1.6 times the board at 9c4018633. The remaining cost is Graphviz (about a third), the lane searches in straighten.ts and relay.ts (crossingsOf over every chain for each column tried), and stacking and wrap choices that lay the board out 6 to 8 times.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every relationship between two bound parts on the 15 current dogfood boards carries an anchor (599 of 599), checked against the source by three agents in parallel. The vault configuration names the evidence kinds each relationship kind accepts, parts bound to index files that only re-export now bind their module, and missing dependencies the check found were drawn. The remaining code-check warnings are each explained in the notes. .archboard/README.md tells a maintainer to run ./bin/dogfood check --code. Verified by a scan of every current board for unanchored relationships and by check and check --code after a server restart.
<!-- SECTION:FINAL_SUMMARY:END -->
