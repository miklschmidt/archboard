---
id: TASK-078
title: 'The vault is the truth: board content stops living in the process'
status: To Do
assignee: []
created_date: '2026-08-20 20:16'
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
- [ ] #1 A board read or write reads the note, and a write writes it back, with no authoritative copy of the elements kept between requests
- [ ] #2 BoardState.note is gone (TASK-063) and the ADR 0006 baseline is a fresh read of the file rather than a hash remembered from the session start
- [ ] #3 Killing and restarting the canvas loses no board content, shown by a check that draws, restarts and reads back
- [ ] #4 What is still held in memory is listed with the reasoning beside it, so the next reader of ADR 0015 does not have to work out why
- [ ] #5 The handlers that read and write a board stay synchronous, and a comment says why
- [ ] #6 CLAUDE.md and the board-store header no longer say nothing is written to disk until a save
- [ ] #7 bun run test is green, with check-boards, check-obsidian-md, check-hot-reload and check-side-by-side specifically exercised
<!-- AC:END -->
