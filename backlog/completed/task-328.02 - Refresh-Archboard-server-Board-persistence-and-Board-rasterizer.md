---
id: TASK-328.02
title: 'Refresh Archboard server, Board persistence and Board rasterizer'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:39'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 565000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server (renamed from canvas server, src/server/archboard), the semantic board store (board and variant renames with formerNames, replaced-relationship notices) and the headless-browser pictures. Walkthrough recording (TASK-304: archboard semantic record, the recording page, tab capture, the voice mixed into the file) shares the headless browser and is drawn on Board rasterizer, which keeps its name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Claim Archboard server, Board persistence, Board rasterizer; read each current variant and every bound file.
2. Board rasterizer: bind Chromium discovery and spawning to headless-chromium/lib/process.ts, launch.ts to starting, pages/windows and stop; draw the walkthrough recording pipeline (record command, walkthrough recorder, page driver, sound conversion, recording page, ffmpeg, Archboard server) sharing the headless browser; a flow and view for one recording; walkthrough beats for why recording is shaped this way.
3. Board persistence: add former names, rename transition, file placement (relocation), discard, board lease, adopt and shelve split from settle, binding checks; move the atomic write under relocation; update views and walkthrough.
4. Archboard server: fix mutation admission (drain, SERVER_BUSY, not one at a time), claims live in the board lease not the store, the route table mounts the write routes; add rename and discard routes, service routes (page, health archboard-server), pane routes, pane socket, board announcements, change feed; update views and walkthrough.
5. Rasterize each board and look; release claims; ./bin/dogfood check clean for my boards; commit only my vault files and the task file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Board rasterizer v6: Chromium discovery and spawning rebound to headless-chromium/lib/process.ts (new 'Chromium executable'); launch.ts node renamed 'Chromium launch' (starts, connects, opens pages and exact-size windows, stops); the three grouped in a 'Headless browser' container (index.ts, ADR 0020); walkthrough recording drawn: Record command, Walkthrough recorder, Page driver, Sound conversion, ffmpeg, Recording page, Archboard server; flow and data-flow view 'One recording' (22 steps, from semantic-record.ts, walkthrough-recorder/index.ts, drive.ts, playable.ts, ui/walkthrough-recording); view 'One browser, two uses'; walkthrough 'How a walkthrough becomes a video'. Rasterize flow's stop step was async, is sync with a return of the teardown proof (the command awaits rasterizer.stop()).
Board persistence v9: added Former names, Rename, Place the file (relocation.ts, which now does every durable write), Discard, Board lease (engine/board-lock.ts), Adopt and Shelve (split from 'Settle and adopt', which bound adoptVariant to settle.ts though it lives in adopt.ts), Binding checks; atomic write edge moved to Place the file; views and walkthrough updated, two beats added.
Archboard server v13: Mutation admission said 'one at a time' but admits and counts all mutation work and refuses a stop with SERVER_BUSY; claim routes call the board lease (engine/board-lock.ts), not the store; the write routes are mounted by semantic-board-routes.ts (node renamed 'Board routes'); browser pane state goes over POST /api/panes (pane-routes.ts); codex bridge moved to the pane socket (websocket-connection.ts). Added Rename route, Discard route, Service routes (page, health archboard-server), Pane routes, Pane socket, Board lease, Board announcements, Change feed; views and walkthrough updated. Shelved 'Readable layout' variant verified byte-identical.
./bin/dogfood check: no diagnostics. PNGs looked at: meaning right; whole-board pictures of Archboard server and Board persistence route long crossing wires with some labels far from their lines (renderer, not meaning).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Brought Archboard server, Board persistence and Board rasterizer in step with src as of 2026-09-24: renames and former names, discard, the board lease, the server's pane, socket, announcement and change-feed modules, and walkthrough recording on the shared headless browser. Every change went through ./bin/dogfood edit under a claim; ./bin/dogfood check reports no diagnostics; each board and its new views were rasterized and inspected; the shelved variant is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
