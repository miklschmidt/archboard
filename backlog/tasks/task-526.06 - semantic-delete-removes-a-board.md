---
id: TASK-526.06
title: semantic delete removes a board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T19:40:00Z'
labels:
  - cli
dependencies:
  - TASK-526.04
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard has no command that deletes a board, so a deletion happens by hand in Git and nobody learns which embeds showed it. The owner asked for the command. ADR 0057 decides its refusals and what its answer lists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard semantic delete <board> removes the whole note, with the lease, --doing from an agent and --expect-version
- [ ] #2 The delete is refused while a node on another board opens the board, and the refusal names those boards
- [ ] #3 The answer lists the tracked embeds of the deleted board
- [ ] #4 After a delete, a new board can take the name and the former names
- [ ] #5 The browser offers no delete
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store (packages/board): the existing discard (TASK-304.02, write/discard.ts) is the one operation that removes a board. Under the board's lease it now also refuses BOARD_OPENED_BY while a drill-down on a current or draft variant of another board of the same vault opens the board (by its name or a former name, with no repository or the vault's own identity), found with the move's own link questions (move/checks.ts drillDownsOpening reusing opensBoard, inboundRewrite and rewriteDrillDowns). Its answer carries the board's trackedEmbeds. Historical and shelved variants do not refuse: they take no content edit, so a refusal there could never be repaired.
2. Wire contract (packages/board/src/shared/protocol/board-discard.ts via ./commands): the discard answer {discarded: {board, version, trackedEmbeds}} and the BOARD_OPENED_BY refusal's openedBy [{board, variant, node}].
3. Server (apps/server): the discard route answers the tracked embeds and the openedBy list. Panes learn as after a move's source deletion: board_note with discarded: true, the doing lines forgotten, this writer's claim released; the pane reads the board again and shows BOARD_MISSING. No browser control.
4. CLI: archboard semantic delete <board> (apps/cli/src/cli/operations/semantic/board/delete.ts, registered in run.ts) with the shared url, directory, doing, expect-version and as-session options; --expect-version required (editedVersion). Answer {board, version, trackedEmbeds}; refusals declared with exits. Client parses the shared answer schema.
5. Tests: store owner (packages/board/tests/runtime/operations/write/discard.test.ts): opener refusal names the boards, history/shelved/other-repo drill-downs do not refuse, tracked embeds answered, names and former names free for a new board. System owner (tests/system/cli/semantic-delete.test.ts): the command's exit codes (no doing, no version, stale, opened by, held by a claim), the file gone, the pane told board_note discarded, the answer's tracked embeds, semantic new with the name and a former name afterwards.
6. Docs: command metadata, docs/design/cli-command-audit.json entry, regenerated contract artifacts.
7. Boards: proposals Board persistence@TASK-526.06 and Archboard server routes@TASK-526.06. Command interface is not branched (parallel work); the notes say exactly what its proposal must draw.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (commit 1cdaaebfb): `archboard semantic delete <board>` (apps/cli/src/cli/operations/semantic/board/delete.ts, registered in run.ts) calls the existing discard route and store operation (TASK-304.02), which is now the one way a board is removed: `semantic delete` and `semantic record --discard` share it.

Decisions:
- One operation, not two. The store's `discardSemanticBoard` gained the opener refusal and the tracked embeds; the route stays POST /api/semantic-boards/discard. Renaming the route and operation to "delete" would be a sweep with no behaviour change, and record --discard still uses the word. record --discard now also refuses a board that another board opens and keeps it, which its existing "kept" path reports.
- --expect-version is required by the CLI (editedVersion, EXPECT_VERSION_REQUIRED exit 2), as for rename and move. The route keeps the version optional for record --discard, which states the version it recorded.
- BOARD_OPENED_BY (exit 5, HTTP 422) is refused under the board's lease. It reads drill-downs on the current and draft variants of every other board of the vault, by the board's name or a former name, naming no repository or the vault's own identity (move/checks.ts drillDownsOpening, reusing the move's opensBoard, inboundRewrite and rewriteDrillDowns). Historical and shelved variants do not refuse: they take no content edit (ADR 0030, content-checks.ts), so such a refusal could never be repaired. A drill-down on a board in another repository's vault cannot be seen from here; that vault's own check names it once the board is gone. The other boards are read without their leases, as the move's checks read them and as ADR 0029 says the drill-down checks do.
- The refusal names each board in its message, and the answer carries openedBy [{board, variant, node}] (packages/board/src/shared/protocol/board-discard.ts, BoardOpenedByAnswerSchema). The CLI appends one line per node to the error.
- The answer is {board, version, trackedEmbeds} (BoardDiscardAnswerSchema.discarded); version is the version the board was at when it went. No refusal for tracked embeds (ADR 0057).
- BOARD_MISSING is not a delete refusal: a stated version never matches a board that is not there, so a missing board is BOARD_VERSION_CONFLICT (exit 5), as for move.
- Names: the name and former names are written only in the note (former-names.ts reads the files), so unlinking it frees them; no index to clear.
- Server memory: the route does what a move's source deletion does: board_note with discarded: true to the vault's panes, the doing lines forgotten (forgetDoing), and this writer's claim released by the store. Another's claim cannot stand, because the admission refused it. The disk watch takes the new fingerprint on the board_note; lock announcements, agent activity and revocation records lapse as they do after a move. The pane reads the board again and shows BOARD_MISSING ("There is no such board"); apps/web needed no change, and the browser offers no delete.

Proof: packages/board/tests/runtime/operations/write/delete.test.ts (opener refusal naming each node, a former name and a draft; shelved and other-repository drill-downs do not refuse; tracked embeds answered; name and former name free for createBoardTransition); packages/board/tests/runtime/operations/write/discard.test.ts (lease and version, claim released, a holder refused); tests/system/cli/semantic-delete.test.ts (exit statuses 1, 2, 5, 5 and 5 with the opener board named; answer trackedEmbeds; file gone; pane board_note discarded; semantic new with the name and the former name); tests/system/server-state/board-discard.test.ts (route, listing, pane).

Proposals: Board persistence@TASK-526.06 (Discard restated; new part Move checks bound to move/checks.ts, with Discard -> Move checks and the seven relationships its binding showed), Archboard server routes@TASK-526.06 (Discard route restated, Agent CLI -> Discard route relabelled). Code check diff with and without --variant TASK-526.06: no line either way. archboard check semantics: no diagnostics. Footprint read against base 1cdaaebfb^ for both: Board persistence named and changed Write under lease, Discard, Move checks; named but not changed only through relationships. Archboard server routes: Discard route named and changed; Board write routes changed but not named: answerRefusal now passes openedBy on, and its drawn relationship (the write envelope and refusal) stays true.

Command interface is NOT branched (parallel work). Its TASK-526.06 proposal must draw:
- part "Delete": kind module, parent "Commands" (bLpk2XKU), binding {repo github.com/miklschmidt/archboard, path apps/cli/src/cli/operations/semantic/board/delete.ts}, responsibility "semantic delete: deletes a whole board at the version read; names each node that opens it on a refusal and each tracked embed in its answer", description "TASK-526.06, ADR 0057. --expect-version is required, as for every write."
- relationship "Contract execution" (E2MAq7W7) -> "Delete": call, label "validated input", anchor {path apps/cli/src/cli/operations/execution/execution.ts, symbol handler}, as for Move (b6VB0y3K) and Rename (ZPdOT4dc).
- relationship "Delete" -> "Board client" (OfRn3av3): call, label "delete the board", anchor {path apps/cli/src/cli/operations/semantic/board/delete.ts, symbol discardSemanticBoardOnServer}.
- optionally relabel Record -> Board client (2CGrRQ78) unchanged; nothing else on that board moves. Then run the code check diff for its proposal name.

Outside this task's fence: bun run lint fails on apps/cli/src/cli/operations/vault/embeds/tracked-embeds.ts:174 (complexity 8 > 6), from commit 686dd722e of the merged feat/check-export-artifacts; the parallel embeds-check work owns it. skills/archboard/references/edit.md says "discard the copy you do not want first" after a stopped move: semantic delete is now that command (TASK-526.07 owns the skill).
<!-- SECTION:NOTES:END -->
