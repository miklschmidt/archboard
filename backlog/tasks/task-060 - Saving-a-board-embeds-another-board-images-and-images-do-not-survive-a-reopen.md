---
id: TASK-060
title: 'Saving a board embeds another board images, and images do not survive a reopen'
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 20:18'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/types.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server, measured in source, not fixed.

Two halves of one gap in how scene files are handled.

src/server.ts around 2678 builds the note's `filesObj` from the whole process-global `files` map with no board filter. The map is keyed by file id and shared by every open board, so saving board A writes board B's images into A's note. With several boards open, every save carries everyone else's attachments.

ingestSceneElements around 2392 never restores `scene.files`, so an image that was in a note is not put back into the map when the board is reopened. The image element survives, its data does not, and the board comes back with a broken picture.

Together: images leak sideways on write and are lost on read. Neither is loud.

The library and stencils are unaffected. This is only the `files` map that carries pasted or imported images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A saved note contains only the images its own board uses
- [ ] #2 An image in a note is restored when the board is reopened, and renders
- [ ] #3 A check saves two boards with different images and asserts neither note carries the other
- [ ] #4 The images a board uses are read from and written to that board note, not held in a process-global map shared by every open board (ADR 0015)
- [ ] #5 A write that is not an explicit save does not copy another board images into a note
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:09
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: still real, and it changes in nature. The bug stays, the fix location
moves, and the urgency goes up.

Confirmed in source, unchanged: `src/server.ts:2679-2680` builds `filesObj`
from the whole process-global `files` map with no board filter, and
`ingestSceneElements` at `src/server.ts:2393` clears `board.elements` and never
looks at `scene.files`.

What ADR 0015 changes:

1. `files` is board content held in a process, which is what ADR 0015 forbids.
   It is `kept('files', ...)` in `src/types.ts:384`, keyed by file id, shared by
   every open board. Under ADR 0015 an image belongs to the note that uses it,
   so this is not a filter to add on the save path, it is a map that stops being
   the authority. The fix moves to whatever reads and writes the note.

2. The leak stops being once per explicit save. Today the vault is written on
   `board save`, which is nine times in the 25 hours `docs/design/stateless-server.md`
   measured. Under ADR 0015 every write is a note write, so board B's images get
   copied into board A's note on every drag of a box on A. The blast radius goes
   from occasional to continuous.

3. The read half lands on the hot path too. `ingestSceneElements` is a load-time
   function today; under ADR 0015 the read side of a read-modify-write cycle
   runs on every write, so dropping `scene.files` would delete the images from
   the note on the first subsequent write rather than merely failing to render
   them.

Sequencing: this must land before the stage that makes every write a note
write, not after it. It is in stage 6 of docs/design/the-plan.md, alongside
TASK-061, as one of the two things that have to be true before the note can be
the only copy.

Added an acceptance criterion for the ADR 0015 half.
---

created: 2026-08-20 20:18
---
Correction to the comment above: the stage number was written before the plan was finalised. This is stage 8 of docs/design/the-plan.md, not stage 6. The sequencing it describes is unchanged: before TASK-078, which is what makes every write a note write.
---
<!-- COMMENTS:END -->
