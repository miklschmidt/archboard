---
id: TASK-367.24
title: The canvas marks the parts and relationships that the code check warns about
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 12:36'
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
<!-- SECTION:NOTES:END -->
