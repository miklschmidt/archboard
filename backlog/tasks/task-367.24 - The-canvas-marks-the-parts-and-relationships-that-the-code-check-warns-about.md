---
id: TASK-367.24
title: The canvas marks the parts and relationships that the code check warns about
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 12:54'
labels:
  - code-check
  - ui
  - renderer
dependencies:
  - TASK-367.03
  - TASK-367.05
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 632000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Findings in a terminal reach an agent. A user reading a board sees nothing. Every visual channel is already taken (ADR 0025, ADR 0031), and the unsettled warning triangle is the nearest precedent for a derived mark. This task decides whether code findings share that mark or need another way, and keeps polling cheap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane shows that a part or relationship of the current variant has code findings, as a derived mark that is never stored
- [ ] #2 The inspector lists the findings for the selected subject
- [ ] #3 The pane reads cached findings and never starts a code pass itself
- [ ] #4 The mark passes a picture review, and every board still lays out under 1 second
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared (src/shared/code-check): RememberedFindingsSchema, the answer of GET /api/vault/code-findings: one reading per board and variant the last pass read, with the board version it read, when it ran, and its findings.
2. Server (src/server/archboard/lib/code-findings-memory.ts): an in-memory memory keyed by board and variant; a completed pass of /api/vault/code-check replaces the readings it read; a cancelled or refused pass changes nothing. mountCodeCheckRoute mounts GET /api/vault/code-findings beside the pass and shares the memory, so the server registration is unchanged; that route only reads memory and never starts a pass.
3. Client: codeFindingsQuery in lib/queries.ts (one cache entry per tab, polled on VAULT_CHECK_POLL_MS: a memory read, never a pass); a hook that narrows it to the board, variant and version on screen (findings of an older version are not shown, so a right board change clears them).
4. Mark: the viewer draws the renderer's own warning triangle (exported from the renderer) on each subject with a warning finding, in a layer it adds and removes inside the subject's own group (ADR 0042), placed where the renderer's unsettled badge goes. The picture's bytes, layout and cache never change. Information findings draw nothing (ADR 0046).
5. Inspector: the selection tab's How does it stand? region gains Against the code: each finding of the selected subject, warnings first, with its evidence.
6. Tests: route+memory (a pass fills it, a read never starts one, a cancelled pass leaves it); rendered owner for mark placement against the renderer's unsettled badge and for the inspector list.
7. Docs: operator-canvas-shell.md selection tab regions and the mark. Picture review at 1920x1080 light and dark on an own server; layout timings; readme:check.
8. Dogfood: TASK-367.24 proposals on Archboard server and Board viewer, closed at the end.

9. Proposals: Archboard server@TASK-367.24 (Code findings memory; Code check route -> memory; Browser -> Code check route) and Board viewer@TASK-367.24 (Mark code warnings; its reads of Semantic queries; the inspector's read; Semantic queries -> Board reads now also the code findings).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions the ADRs left open:
1. The mark is shared: a code warning wears the picture's own unsettled warning triangle, in the same place (top-right corner of a part's body, a container's header; leading edge of a relationship's or message's words; middle of the longest straight run of a line with none). One triangle means one thing on every subject: look at this before you trust it; the selection tab says why, and lists both when a subject is undecided and warned about. A second mark would be a new vocabulary item in a picture whose channels are all taken (ADR 0025, ADR 0031), and the two facts have the same reader action (read the selection tab).
2. The viewer draws it, not the renderer: findings come from the code and from server memory, not from the board, so a picture stays drawn from the board alone (ADR 0023) and an export or recording is the same bytes. The viewer adds the renderer's own mark markup (exported as cornerWarning/lineWarning from the renderer) into the subject's own group, as ADR 0042 lets the viewer add a layer (lit-ink copies). So the mark moves, recedes and ghosts with its subject, and no layout or picture cache key changes: layout time is untouched by construction.
3. Warnings only on the canvas; information draws nothing (ADR 0045/0046). The inspector lists both, warnings first, warnings with the triangle glyph, information muted.
4. A pane shows findings only over the exact board, variant id and version the pass read. A board changed since the pass was not read by it, and a right board change must clear the warning (ADR 0046 warning rule), so stale findings show nothing until the next pass.
5. The memory is keyed by board and variant: a pass replaces the readings of the boards it read and keeps the others, so a --variant pass does not forget the current variants. A cancelled pass (signal aborted) and a NO_SUCH_DRAFT refusal leave it unchanged. checkedAt is when the pass started; the inspector shows it so a reader knows how old the news is.
6. Polling: one query per tab (key code-findings) on VAULT_CHECK_POLL_MS, the cadence a pane already learns of vault edits; the route reads memory only. No new socket message: a pass is rare and a memory read is cheap; timing.ts is outside this task's fence, so no new constant.
7. A recording (walkthrough replay) reads no findings: talkReads answers no readings, so videos stay what the voice spoke over.
8. The memory and its route live beside the code check route in src/server/archboard (mountCodeCheckRoute mounts both and shares the memory), so the server's registration in application.ts is unchanged.

Close of the proposals. Board viewer@TASK-367.24 matched the build (Mark code warnings binds hooks/use-code-marks.ts useCodeMarks; Render stage states -> Mark code warnings anchored at useCodeMarks in SemanticDiagram.tsx; Mark code warnings -> Semantic queries anchored at codeFindingsQuery in use-code-findings.ts; Render stage states -> Semantic queries anchored at useCodeFindings in SemanticInspector.tsx; Semantic queries -> Board reads now also reads the code findings), given the board's scope as summary and adopted at v49. Archboard server: TASK-369.04 was adopted after the branch, so the change was restated as 'TASK-367.24 after TASK-369.04' (Code findings memory binds code-findings-memory.ts createCodeFindingsMemory; Code check route -> memory anchored at remember in code-check-route.ts; Browser -> Code check route anchored at fetchCodeFindings in api/semantic-boards.ts), the old proposal shelved with that reason, adopted at v58. ./bin/dogfood check: no diagnostics. ./bin/dogfood check --code: exit 0, no findings.
Footprint read against base 1efcf892d (the commit before 8eeca0e71). Board viewer: changedNotNamed Fetch semantic reads (api/semantic-boards.ts, 8eeca0e71): it gained fetchCodeFindings, one more read of the same semantic read routes its relationship to Archboard server already draws; namedNotChanged Render stage states is named only by relationships. Archboard server: changedNotNamed Archboard server (container, src/server/archboard): code-check.ts now also exports the memory, inside the container, and the memory is named; History lens changed only by TASK-369.04's commits.
Behind: my commit 8eeca0e71 puts Semantic renderer (View dispatcher, Renderer core) and Renderer layout (Renderer core) behind. Both still right: the renderer only exports its existing warning mark for a page (cornerWarning, lineWarning) and its drawing is unchanged; neither board draws the viewer as a caller, as the legend's use of standingMark is not drawn either.
Picture review (own server on port 3424, a copy of the dogfood vault with a binding symbol, a container symbol and an anchor that no longer hold; 1920x1080, light and dark; screenshots in the session scratch dir shots/): the triangle stands on the top-right corner of Code check route, on the container header of Archboard server, and on the leading edge of the words of Code check route -> Code check, identical to the unsettled badge; the selection tab lists the finding under Against the code with the triangle glyph and the time of the pass. A board edit cleared the marks at once, and a new check --code brought them back within one poll. Fixed after review: the time lost its leading zero. Left as found: the triangle keeps its 11 units in far view (the renderer's rule for the unsettled badge too), so at fit on the largest board (Archboard server, scale about 0.3) it is about 3 px; edge-word marks hide with the words in far view.
Layout (bun docs/design/wide-board-layout-fixtures/timing.ts 5, first render): flask-map-1 181 ms, flask-map-2 162, flask-map-3 119, phone-ownership 34, public-api-independent 145, system-map 148, Agent workbench 292, Archboard server 851, Archboard 25, Board persistence 252, Board rasterizer 158, Board viewer 913, Browser application 92, Codex session 116, Codex workhorse 59, Command dispatch 111, Command interface 485, Renderer layout 34, Semantic renderer 62, Skill evaluation 510, Voice coordinator 63; slowest 913 ms (Board viewer), all under 1 s. The mark changes no layout: it is drawn by the viewer after the picture is laid out.

Layout after adoption: Board viewer's first render rose to 1012-1063 ms (timing.ts, load average about 5 from other agents); in fresh processes it was about 1100 ms before this task's change and about 1200 ms after. The inspector's read, a second relationship between Render stage states and Semantic queries, was what pushed it over: carried instead on the existing Semantic queries -> Render stage states data relationship ('the render answer, the code findings'), the same meaning, the board lays out in 550-580 ms. Adopted as Board viewer 'TASK-367.24 layout' (v52); Semantic queries is a hidden part again, as before the task. timing.ts after it, first render: flask-map-1 186, flask-map-2 169, flask-map-3 124, phone-ownership 34, public-api-independent 159, system-map 147, Agent workbench 300, Archboard server 560, Archboard 24, Board persistence 257, Board rasterizer 194, Board viewer 445, Browser application 99, Codex session 119, Codex workhorse 64, Command dispatch 122, Command interface 499, Renderer layout 37, Semantic renderer 64, Skill evaluation 521, Voice coordinator 60; slowest 560 ms (Archboard server).
Anchors: once TASK-367.06's ANCHOR_MISMATCH ran on the dogfood server, two of this task's anchors named a definition outside both ends (fetchCodeFindings for Browser -> Code check route; useCodeFindings for Semantic queries -> Render stage states). Corrected through 'TASK-367.24 anchors' on both boards (mountCodeCheckRoute in code-check-route.ts; codeFindingsQuery in queries.ts), adopted at Archboard server v65 and Board viewer v55. ./bin/dogfood check: no diagnostics; ./bin/dogfood check --code: no findings.
Gate: lint fails only in src/runtime/code-check/lib/check.ts (complexity, TASK-367.06's uncommitted work); type-check fails only on node_modules/web-tree-sitter types (EmscriptenModule, TASK-367.06's dependency); fmt:check 0; build:frontend 0; test:modules 4068 pass 0 fail; test:system 192/0; test:repository 20/0; test:serial-browser: every owner passed except codex-live-voice (dock mute operability), which passed when run again alone.
readme:check lists all 13 assets stale by source hash (the assets were made 119 commits ago); this task changes none of their pictures: no README asset runs a code pass, so no mark appears, and the renderer's output bytes are unchanged.
<!-- SECTION:NOTES:END -->
