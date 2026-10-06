---
id: TASK-367.27
title: The dogfood boards carry anchors and pass the code check
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 15:05'
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
- [ ] #1 Every relationship between bound parts on the current dogfood boards carries an anchor
- [ ] #2 `./bin/dogfood check --code` reports no finding, or each remaining one is fixed on the board or explained in the task notes
- [ ] #3 `.archboard/README.md` tells a maintainer to run the code check
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
<!-- SECTION:NOTES:END -->
