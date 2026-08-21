---
id: TASK-078
title: 'The vault is the truth: board content stops living in the process'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:16'
updated_date: '2026-08-21 10:43'
labels: []
dependencies:
  - TASK-068
  - TASK-074
  - TASK-060
  - TASK-061
  - TASK-077
references:
  - src/core/board-store.ts
  - src/types.ts
  - src/server.ts
  - src/core/change-feed.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/design/server-is-the-truth.md
  - docs/design/stateless-server.md
priority: high
type: enhancement
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 8 of docs/design/the-plan.md. The persistence half of ADR 0015: "The canvas server holds no authoritative copy of a board. The process reads it, writes it, and keeps nothing of it."

WHAT IS HELD TODAY, from `src/core/board-store.ts` and `src/types.ts`, read out of the source rather than guessed:

  boards                      board-store.ts:62   every board opened this session, keyed by address
  BoardState.elements         :35                 the elements, and the only copy when unsaved
  BoardState.identity         :34                 name, variant, level, display casing
  BoardState.vaultBacked      :38                 whether the board has a home
  BoardState.file             :39                 where
  BoardState.note             :43                 the last note bytes, written and never read (TASK-063)
  BoardState.baseline         :54                 path, sha-256, timestamp; the ADR 0006 check
  BoardState.loadedAt/savedAt :55,56              what the shell dirty indicator reads
  scratch board               :72,76              a board with no file, by design
  files                       types.ts:384        image blobs, process-global and not per board (TASK-060)
  snapshots                   types.ts:362        named deep copies of a board

WHAT TO DO. Every request that reads or writes a board reads the note and, if it writes, writes it back. The measured cost of a full read-modify-write with an atomic tmp-write-fsync-rename is 6.21 ms at 55 elements and 9.75 ms at 300, of which the fsync is 5.15 to 5.25 ms and does not vary with size. Against the busiest measured second of real use, 7 writes, that is 68 ms at 300 elements, or 7% of that second, on a board four times larger than anything real.

WHAT HAS TO BE TRUE FIRST, and each is a task of its own:

- The fan-out is batched (TASK-068). Without it one `align` is 20 read-modify-write cycles and 195 ms, concurrently.
- Notes are written atomically (TASK-061). The note becomes the only copy, so a torn write is the board gone rather than the last save lost.
- Images live in the note they belong to (TASK-060). Otherwise the leak that today happens on 9 explicit saves a day happens on all 370 writes.
- Scratch has a home (the scratch task), or there is a board the store cannot stop holding.

WHAT IS ALLOWED TO STAY IN MEMORY, and this needs stating because ADR 0015's carve-out names only sockets, panes, focus and selection:

- Session and display state, which cannot live in a note: `clients`, `clientIds`, `panes`, `paneBoards`, `selectionState`, the four `pending*` maps, `wiring`.
- The change feed's `baseline` and `checkpoints` (`src/core/change-feed.ts:89,119`) and `snapshots`. These hold copies of a board, which reads like a violation, and are not: they are the board as it stood at a past moment, and the disk holds the board as it stands now. The vault never held them, so making the server stateless does not move them to disk. Losing them loses no work, only history.
- A per-board write ordering, if the handlers ever stop being synchronous. Express serialises synchronous handlers, so within one process there is no interleaved read-modify-write today. Keep them synchronous, and if that changes, the ordering becomes mandatory rather than merely wise. Cross-process exclusion is ADR 0016 and TASK-067, not this task.

Whichever of these survive, write the reasoning next to them, because the next person to read ADR 0015 will ask why a copy of a board is still in the process.

WHAT GOES. `BoardState.note` (TASK-063) goes with the rest. `BoardState.baseline` becomes a read of the file rather than a remembered hash: the ADR 0006 check stops asking "has this changed since the session began" and starts asking "has this changed since two milliseconds ago", which is what makes overwrite and save-elsewhere still meaningful under a stateless server.

DOCUMENTATION. CLAUDE.md describes the board store as "not a cache of the vault, and nothing here is written to disk until a save", and `src/core/board-store.ts` opens with a header saying the same. Both become wrong. INSTALL.md and TESTING.md may too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board read or write reads the note, and a write writes it back, with no authoritative copy of the elements kept between requests
- [x] #2 BoardState.note is gone (TASK-063) and the ADR 0006 baseline is a fresh read of the file rather than a hash remembered from the session start
- [x] #3 Killing and restarting the canvas loses no board content, shown by a check that draws, restarts and reads back
- [x] #4 What is still held in memory is listed with the reasoning beside it, so the next reader of ADR 0015 does not have to work out why
- [x] #5 The handlers that read and write a board stay synchronous, and a comment says why
- [x] #6 CLAUDE.md and the board-store header no longer say nothing is written to disk until a save
- [x] #7 bun run test is green, with check-boards, check-obsidian-md, check-hot-reload and check-side-by-side specifically exercised
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New src/core/board-io.ts: readBoardContent(board) reads board.file and returns {elements, files, note, hash}; writeBoardContent renders the note, checks ADR 0006 against the destination, writes atomically and re-records the baseline. ingestSceneElements moves here.
2. BoardState loses elements, files and note (TASK-063). It keeps identity, file, baseline, loadedAt, savedAt: which boards this canvas has open and where each note is, which is registry state, not board content.
3. boardFromRequest returns {key, board, content}. Every board.elements/board.files site in server.ts reads the per-request content instead.
4. Every mutating route persists through one funnel next to noteChange, so a write is a read-modify-write against the note and nothing survives the request.
5. ADR 0006 fires on the persist path: a note whose bytes are not the ones archboard last wrote or read is refused, 409, with the three outcomes. Stop at TASK-079's boundary (the refusal still interrupts).
6. Answer the open question in ADR 0015: the change feed's baseline/checkpoints and snapshots stay in memory because they are the board at a past moment and the vault never held them.
7. Fix CLAUDE.md and the board-store header.
8. A check that kills and restarts the canvas and reads the board back (AC 3), plus revert-proofs and timings.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED. src/core/board-io.ts is the one place a note is read or written. BoardState keeps identity, file, baseline, loadedAt, savedAt and nothing else; elements, files and note are gone (TASK-063 closed with it). boardFromRequest reads the note per request and every mutating route ends at persistBoard, which writes it back before anything is broadcast.

ADR 0006: the operand is the baseline, the bytes archboard last wrote at that path, and NOT the read at the top of the request, which would make the check vacuous. Because a write happens on every gesture the baseline is milliseconds old. The refusal reaches an ordinary element route as 409 with the conflict as data; board open --reload is what un-sticks a board afterwards.

FOUR CONVERSIONS MOVED TO THE WRITE BOUNDARY. Each was a note-only rewrite that became a document with two answers once the note was the board: the block id a text element gets when its own cannot be a block reference (the write used to answer with an id the board did not hold), the boundElements entry a shape owes an arrow bound to it, the z-order (the note reissued every index while the board repaired them, two rules), and rawText. check-live-session found the last three in that order on cycles 1, 7 and 15.

THE NOTE KEEPS source AND AN ARROW'S start/end, through a keepServerFields option on buildScene. Nothing else can recover them: source is what says a human drew an element, start/end are what rerouteBoundArrows reads to follow a moved box. export --out is unchanged, because a file for another tool does not want archboard's bookkeeping.

POST /api/files now answers with 'orphaned' when data is posted before the element that draws it, rather than accepting it and dropping it: a note holds only the images its own elements reference.

MEASURED COST, docs/design/server-is-the-truth.md section 8: 15.6 ms at 56 elements, 18 to 23 ms at 300, against 6.21 and 9.75 predicted. Parse and render came in as predicted (0.23/1.10 and 0.78/3.80); the fsync is 9.7 to 12.6 ms rather than 5.15 to 5.25 and is still flat in board size. 11 to 16 percent of the busiest measured second.

REVERT PROOFS, failing checks when each change is undone: no write reaches the note = 40 (boards 25, labels 5, one-write 1, geometry 1, browser 3, live-session 5). Block ids settled by the note writer = 5 (boards). A shape not told about its arrow = 1 (live-session). rawText filled on the way out = 1 (live-session). The note dropping source and start/end = 4 (one-write 3, geometry 1). The note reissuing every index = 1 (live-session). The canary not recording a board's note path = 3 (hot). The ADR 0006 check comparing against this request's own read = 3 (boards).

Both browser checks pass. check-fixed-point is unchanged and still reports 0 of 12 elements changed. check-live-session needed one change: a text element's width is now measured by our measurer on every write rather than kept as the pane sent it, so the two measurers' documented 0.0012 px disagreement became visible. Differences below that are agreement for width on text and nothing else.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The note is the board. Every request that touches one reads its note and every write writes it back, through src/core/board-io.ts; BoardState keeps which boards this canvas has open and where each one's note is, and nothing else. BoardState.note is gone (TASK-063), and ADR 0006's baseline is the bytes of the previous write rather than a hash taken at open, so the question is 'did somebody get in between our last two writes'.

Verified by bun run test, 22 steps green including both real-browser checks: check-fixed-point unchanged at 0 of 12 elements changed, and check-live-session agreeing after all 42 cycles of mixed agent and human writes. check-boards gained a block that kills a canvas with SIGKILL after drawing on two boards and saving neither, restarts it and finds both whole, then edits a note behind the canvas's back, watches a read come back changed with no reload, and watches the next write refused with ADR 0006's three outcomes and nothing written. Each change was reverted and the failures counted; the numbers are in the implementation notes.

Measured at 15.6 ms a write on a 56-element board and 18 to 23 ms at 300, against 6.21 and 9.75 predicted. The parse and the render came in where predicted; the fsync is about twice the estimate and still flat in the size of the board.

STOPPED AT TASK-079. The refusal now arrives 400 ms after a human lifts their finger rather than when somebody chose to save, and it still interrupts: an element route answers 409 with the conflict attached and the pane keeps its scene. Making that stop interrupting, and offering the three outcomes when the human asks for them, is TASK-079.
<!-- SECTION:FINAL_SUMMARY:END -->
