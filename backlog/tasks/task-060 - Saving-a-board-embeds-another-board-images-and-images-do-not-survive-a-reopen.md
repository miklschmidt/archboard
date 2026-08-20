---
id: TASK-060
title: 'Saving a board embeds another board images, and images do not survive a reopen'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 22:26'
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
- [x] #1 A saved note contains only the images its own board uses
- [x] #2 An image in a note is restored when the board is reopened, and renders
- [x] #3 A check saves two boards with different images and asserts neither note carries the other
- [x] #4 The images a board uses are read from and written to that board note, not held in a process-global map shared by every open board (ADR 0015)
- [x] #5 A write that is not an explicit save does not copy another board images into a note
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish what a board's images are. Excalidraw's own model says it: an image element carries fileId and the scene's files map is keyed by that id. Nothing in archboard's data model says which board a file belongs to today, so the relation comes from the elements, not from a heuristic.
2. Give each board its own files map on BoardState, and delete the process-global kept('files'). A branch copies it, like it copies elements.
3. Board-scope the files API: GET/POST/DELETE /api/files resolve a board like every other route, and the broadcast goes to that board rather than boardless.
4. Filter on write in one place: buildScene keeps only the files the elements it is exporting reference. That covers the note, export --out and every other scene writer at once.
5. Restore on read: ingestSceneElements takes scene.files back into board.files, so an image survives a reopen and, under stage 8, is not deleted by the next write.
6. Carry files to the pane on board_switched as well as initial_elements, since a pane switching to a board with images gets none today.
7. Check in check-boards.mjs: two boards with different images, saved, and neither note carries the other's; reopen restores; a change report that is not a save writes nothing of another board.
8. Record the Obsidian convention finding: the plugin's ## Embedded Files section, and what it does to our notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
What a board's images are, established first. Nothing in archboard's data model said: `files` was one kept() map per process, keyed by file id, and /api/files named no board. Excalidraw's format does say, and it is the only thing that does. An image element carries `fileId` and the scene's `files` map is keyed by it, confirmed in the Obsidian plugin's own code (`scene.elements.filter(el => el.fileId === key)`, ExcalidrawData.ts:1719). So a board's images are the ones its own elements draw. That is a relation, not a heuristic.

Write half. BoardState.files replaces the process-global map, and buildScene narrows a scene's files to the ids its exported elements reference. Filtering there rather than on the save path means the note, `export --out` and every other scene writer are covered by one implementation, which is the shape that still holds when stage 8 makes writes happen from places other than `board save`.

Read half. ingestSceneElements now takes scene.files back into board.files. It had lost nothing yet: the only route into the old map was POST /api/files, used by `archboard import`, and the browser never uploads image data at all (it reports element deltas, not files), so no board in the vault has ever had images that a reopen could drop. The bug was live and untriggered.

Also fixed on the way, both found by the per-board move: board_switched carried elements and no files, so a pane pointed at a board with pictures got holes; and a branch got copies of the elements and none of the image data, so its note would have been written with the pictures missing.

/api/files GET, POST and DELETE are board-scoped now and refuse a caller that names no board, like every other content route (ADR 0009). The CLI already sends ?board= on every request, so nothing there changed; frontend fetchFiles takes the board it is holding.

Revert-proof, in check-boards.mjs: unfiltered write half fails 5, dropping the read half fails 2, dropping files from board_switched fails 1, dropping the branch copy fails 1.

The read-half check opens a note this process has never held (a copy of the saved note under a second board name). An earlier version reopened the same board with --reload and passed with the restore deleted, because getOrCreateBoard hands back the board that is already open with its images still in memory.

Boundary: BoardState.files is board content held in a process, which is what TASK-078 removes. Stopped there. Making the store stateless depends on stage 7 and is not this task.

Validation: bun run test green, 18 suites, exit 0.
<!-- SECTION:NOTES:END -->

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

author: @claude
created: 2026-08-20 22:26
---
Obsidian's own convention for embedded files, read out of the plugin source rather than its docs (zsviczian/obsidian-excalidraw-plugin, src/constants/constants.ts and src/shared/ExcalidrawData.ts).

The plugin has a `## Embedded Files` section between `## Text Elements` and the `%%`/`## Drawing` block. Its lines are `<fileId>: [[vault/path.png]]` for a vault file, `<fileId>: <https url>` for a hyperlink, and `<fileId>: \$\$latex\$\$` for an equation. Parsed by REG_FILEID_FILEPATH at ExcalidrawData.ts:867.

What it does with a scene like ours is the part that matters. syncFiles() walks scene.files, and for every entry no Embedded Files line already covers it calls saveDataURLtoVault(): the base64 is written out as a real vault image file, a `fileId: [[path]]` line is recorded, and then syncElements sets `this.scene.files = {}` outright (ExcalidrawData.ts:1755). So the plugin accepts base64 in the Drawing block as an input and migrates it out on first open. Its own notes carry no image bytes in the Drawing block at all.

Two consequences, neither of them in this task's acceptance criteria:

1. A note archboard writes is readable by the plugin, because base64 in scene.files is exactly the input shape it accepts. That is why this task's fix is enough to be correct today.

2. A note the plugin has opened comes back with no scene.files and an `## Embedded Files` section instead. archboard's preservedRegions (src/core/obsidian-md.ts) splits the note at `# Excalidraw Data` and keeps the body above and the trailing region below the Drawing block, so everything between them is regenerated: **a save deletes the `## Embedded Files` section**, and with it the fileId-to-path mapping that is the only record of where those images went. The image files stay in the vault and nothing can find them again. That is pre-existing, unchanged by this task, and it fires on every write rather than on a save once ADR 0015 lands.

Stopped at that boundary deliberately. Preserving the section is a change to which bytes of a note a save may regenerate, which is check-obsidian-md's subject and stage 5's; reading the images back out of vault files is bigger again (wikilink resolution, reading binaries, base64). Needs a decision about whether archboard should write the plugin's shape or keep its own.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board's images are the ones its own elements draw, and they live on the board. BoardState.files replaces the process-global map that made saving board A write board B's pictures into A's note; buildScene narrows a scene's files to the fileIds its elements reference, which covers the note, export --out and anything else that assembles a scene; ingestSceneElements takes scene.files back off the note, so an image survives a reopen and is not deleted by the next write once ADR 0015 lands. /api/files is board-scoped and refuses a caller that names no board. Two more holes closed on the way: board_switched now carries the board's images, and a branch gets copies of them. Verified in scripts/check-boards.mjs with two boards holding different images, a cold open of a note this process has never held, and buildScene checked on its own; reverting the write filter fails 5 checks, the read restore 2, board_switched 1, the branch copy 1. Obsidian's own ## Embedded Files convention is recorded in a comment, along with the pre-existing bug it exposes, which is out of this task's scope. bun run test green.
<!-- SECTION:FINAL_SUMMARY:END -->
