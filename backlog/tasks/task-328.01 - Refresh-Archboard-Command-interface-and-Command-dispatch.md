---
id: TASK-328.01
title: 'Refresh Archboard, Command interface and Command dispatch'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:35'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 564000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
System board and the CLI. The CLI gained commands since 2026-09-17 (semantic record, rename, and others): read src/cli. The record command's pipeline itself is drawn on Board rasterizer (TASK-328.02); the Command interface board links there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Claim each board (Archboard, Command interface, Command dispatch) and show it.
2. Read every bound file and its surroundings (src/cli, command metadata, src/server/archboard, stores); list drifts with file+symbol evidence.
3. Write corrections via ./bin/dogfood semantic edit with --expect-version and --doing, keeping ids; current variant only.
4. Add what code since 2026-09-17 needs (record, rename, shared Codex home, recordings) with drill-down from the record group to Board rasterizer.
5. Rasterize each board, inspect PNGs, release claims, ./bin/dogfood check clean.
6. Commit the three board files and this task file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drift found and fixed (evidence file:symbol):
Command dispatch: runCliWith never called the registry for help/version; printedHelp calls helpText (session.ts), so mVCMJYpN now lands on Help text. Registry -> Help text was false (help.ts builds its tree from the routes, not registryOf): removed. Added dispatchedCommand -> Registry childOf (dispatch.ts), Command catalogue -> Registry registryOf for the contract audit (run.ts cliContractRegistry, artifacts.ts), runCliWith -> Server client for applyShared (session.ts setRequestedBoard/setWriteDoing/...), Failure reporting -> Server client formatBoardRefusal (exit-codes.ts). Spine argv -> select -> execute -> runCommand marked hero with traffic. Beats now say help is answered first and a shared option the command does not read is refused.
Command interface: Bootstrap -> Command catalogue was false (src/bin.ts calls applyCliBootstrap then runCli): new Entry point (src/bin.ts) calls both. Claims and Panes call src/runtime/engine/server-client.ts (claimBoard, getPanes), not semantic-board-client: new Server client node, old one renamed Board client (id kept) and it calls requestJson in Server client, which carries the HTTP edge. Contract execution -> Archboard server auto-start (prerequisites.ts ensureServerRunning). Groups added since 09-17: Rename (semantic-rename.ts), Record (semantic-record.ts) -> Walkthrough recorder (src/runtime/walkthrough-recorder, drills to Board rasterizer) -> Archboard server recording page (index.ts pageUrl/Page.navigate); shelve added to Semantic lifecycle. Groups the table had but the board lacked, so the 'What the CLI can be asked' view named every group: Render, Inspect, Repositories, Install skill, Status.
Archboard: new datastore Codex home (TASK-313 shared CODEX_HOME, codex-workbench-production.ts createWorkbenchStorage, storage.ts config), with server prepares/writes config (TASK-314 auto-review) and app-server reads it; Codex app-server -> Agent CLI (workhorse-developer-instructions.txt, storage.ts DEFAULT_SETTINGS network access); Headless Chromium -> Archboard server recording page; Agent CLI -> Repository checkout (repo.ts declareRepo). New beat on pictures taken outside the server; Codex beat updated. ffmpeg (optional, record only) mentioned in Agent CLI description rather than a node.
Variant summaries cannot be edited by semantic edit, so 'as inspected 2026-09-13' in Archboard's summary stays.
Verification: all three boards rasterized and read; ./bin/dogfood check reports 0 diagnostics; claims released.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Archboard, Command interface and Command dispatch now describe the code as of 2026-09-24: the dispatch board's help and registry relationships follow session.ts/help.ts/dispatch.ts and it draws where the stated flags go; the CLI board has a true entry point, separates the board client from the server client, draws every command group (rename and record new, with record reaching Board rasterizer through the walkthrough recorder) and the auto-start; the system board draws the shared Codex home, the Codex threads' use of the CLI, the recording page and repo registration. Every change went through ./bin/dogfood semantic edit under a claim, ids kept, no historical variant touched. Verified by reading each write's answer against the source evidence in the notes, rasterizing and viewing all three boards, and ./bin/dogfood check reporting 0 diagnostics.
<!-- SECTION:FINAL_SUMMARY:END -->
