---
id: TASK-065
title: >-
  The server should be the source of truth: one representation, and a write
  returns the resulting document
status: To Do
assignee: []
created_date: '2026-08-20 19:38'
updated_date: '2026-08-22 20:00'
labels: []
dependencies: []
references:
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/changes.ts
  - src/core/expand-elements.ts
  - src/server.ts
  - docs/design/the-plan.md
  - docs/design/server-is-the-truth.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0016-one-writer-at-a-time-per-board.md
priority: high
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
THE PARENT TASK for the source-of-truth work. It is done when its subtasks are. Do not implement it directly.

The ordered plan is docs/design/the-plan.md. The measurements behind it are docs/design/server-is-the-truth.md. The decisions are ADR 0015 (the vault is the truth, and the agent-friendly shape is an input format) and ADR 0016 (one writer at a time, per board).

WHY. Stated by the user as a design principle:

"Sending diffs back and forth between the server and browser and the server and the agent is fine. But it's also fragile as fuck, one small bug in the diffing or a divergence caused by two code paths doing essentially the same thing is going to cause apocalyptic problems really fast. Submitting a diff to the server should cause a write, and the server should return the full resulting document. This is mostly to ensure the browser actually renders the persisted document and not some arbitrary 500-step maybe-consistent diff-patched client-side document. The server should be the source of truth. Always."

THE EVIDENCE IS THIS REPO'S OWN BUG LIST. The server stores agent-friendly seeds (`label`, `start`, `end`) and the browser converts them to Excalidraw's native form. Two representations with a conversion between them, run every cycle. That gap alone produced four bugs:

  TASK-024  labels bred a new bound text every round-trip; one arrow reached 42 copies of its label and collapsed to height 0.9999999999999716
  TASK-028  a human renaming a label got reverted
  TASK-029  emptying a label brought the old text back
  TASK-034  bound label coordinates drifted from their container, once by 1170px, skewing the scene box and every layout signal

Each was fixed on its own terms. The gap that produced them is still there.

WHAT "ONE REPRESENTATION" HAS TO MEAN. Not "one implementation of the conversion". Excalidraw is the renderer whatever we do, and it silently corrects anything it disagrees with at render time. A saved 15-element board, opened and rendered once in a real browser, came back with 13 of its 15 elements changed. The same board already in native form, handed back through `updateScene`, changed 0 of 13. So the target is a document Excalidraw does not change, and the only check that proves it is a real browser reporting nothing back.

THE HARD CONSTRAINT IS IDS, NOT PERFORMANCE. Applying a document in which an open text editor's element had been renamed discarded five typed characters with no error, no warning and no visible change. No amount of timing fixes that; the next keystroke still goes to an element that is gone. Every id is minted once, at the write boundary, in one to eight characters from Obsidian's block alphabet, so the note writer has nothing to rename.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 There is one representation: the agent-friendly shape is converted once on write and never on read, and no conversion runs in the browser
- [x] #2 What the server stores is a fixed point, shown by rendering a converted board in a real browser and asserting the browser reports nothing back
- [x] #3 A write returns the resulting board and the pane renders that, rather than its own patched copy
- [x] #4 The browser still sends a delta, so a stale tab still cannot claim a deletion for an element it never received (TASK-016)
- [ ] #5 Every element id is minted once by the server, in a form the note writer never renames, so an echo cannot rename an element out from under a cursor
- [x] #6 A check drives a long session of mixed agent and human writes and asserts the pane document and the server document stay byte-identical
- [x] #7 An agent write returns the elements it touched plus a board fingerprint, not the whole board, because the whole board is about 60k tokens at 300 elements
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:11
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: changed in nature. The principle stands and is now recorded as ADR
0015. What was one task is now the parent of a stage list, and two of its own
open questions have been answered by measurement.

Converted to the parent. The build is planned in docs/design/the-plan.md and
broken into subtasks; this task is done when they are. Its "WHAT TO BUILD, IN
ORDER" section is superseded by that plan and has been replaced by a pointer,
because two documents giving the order is how the order drifts.

ANSWERED SINCE FILING, all in docs/design/server-is-the-truth.md:

- Applying a full scene mid-gesture. Measured, not designed around. A drag
  survived 70 writes to another element and 40 writes to the element being
  dragged; a text editor survived 18 full-document applies with focus and every
  typed character intact. Excalidraw recomputes a dragged element from a
  pointerdown snapshot plus the pointer delta on every move, so an intervening
  `updateScene` is simply overwritten. The echo needs no gate and does not have
  to wait for the mutex.
- Cost. 3.4 ms extra at 55 elements and 14.0 ms at 300, on a response that was
  already being sent, arriving after the gesture is over. Acceptance criterion 6
  is satisfied by that document.
- Element ids. `regenerateIds: true` is only on the mermaid path and is correct
  there. The real id churn is the note writer renaming text ids to eight
  characters, plus the converter minting a nanoid per label seed. That matters
  more than anything else here: applying a document in which an open text
  editor's element had been renamed discarded five typed characters with no
  error at all. Minting every id once, at the write boundary, in Obsidian's
  block alphabet, is the answer, and it ships ahead of everything else.
- Whether the agent path gets the same treatment. No, not literally. 300
  elements is 229,551 bytes, roughly 60,000 tokens, and `align` in a loop would
  pull 1.2 million tokens through an agent's context. The agent gets the touched
  elements in their resulting form plus a board fingerprint, and the whole
  document only behind an explicit flag.

CORRECTED. Acceptance criterion 1 as written was not sufficient and has been
rewritten. "The server stores what Excalidraw renders" sounds like it is
achieved by having one converter, and it is not: dropping
`convertToExcalidrawElements` removes a converter we do not control, but
Excalidraw is still the renderer and still silently corrects anything it
disagrees with. A saved 15-element board, opened and rendered once, came back
with 13 of its 15 elements changed. The same board already in native form,
handed back through `updateScene`, changed 0 of 13. So the target is the fixed
point, not the single implementation, and the only check that catches a
converter which is single and still wrong is a real browser reporting nothing
back.

ALSO CORRECTED, in ADR 0015 itself rather than here: the ADR claimed `apply`
already batches. It does not. `src/cli/commands/elements.ts:54` loops one PUT
per update and one DELETE per delete, and only creates are batched. The batched
route is `POST /api/elements/changes`. `src/cli/run.ts:35` still describes
`apply` as applying a patch "in one call" and needs the same correction.
---
<!-- COMMENTS:END -->
