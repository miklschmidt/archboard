---
id: TASK-065
title: >-
  The server should be the source of truth: one representation, and a write
  returns the resulting document
status: To Do
assignee: []
created_date: '2026-08-20 19:38'
updated_date: '2026-08-20 19:38'
labels: []
dependencies: []
references:
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/changes.ts
  - src/core/expand-elements.ts
  - src/server.ts
priority: high
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stated by the user as a design principle, alongside the stateless-server principle:

"Sending diffs back and forth between the server and browser and the server and the agent is fine. But it's also fragile as fuck, one small bug in the diffing or a divergence caused by two code paths doing essentially the same thing is going to cause apocalyptic problems really fast. Submitting a diff to the server should cause a write, and the server should return the full resulting document. This is mostly to ensure the browser actually renders the persisted document and not some arbitrary 500-step maybe-consistent diff-patched client-side document. The server should be the source of truth. Always."

THE EVIDENCE IS THIS REPO'S OWN BUG LIST. The server stores agent-friendly seeds (`label`, `start`, `end`) and the browser converts them to Excalidraw's native form with convertToExcalidrawElements(..., { regenerateIds: true }) at frontend/src/canvas/useCanvasSession.ts:624. Two representations with a conversion between them, run every cycle. That gap alone produced four bugs:

  TASK-024  labels bred a new bound text every round-trip; one arrow reached 42 copies of its label and collapsed to height 0.9999999999999716
  TASK-028  a human renaming a label got reverted
  TASK-029  emptying a label brought the old text back
  TASK-034  bound label coordinates drifted from their container, once by 1170px, skewing the scene box and every layout signal

Each was fixed on its own terms. The gap that produced them is still there.

WHAT TO BUILD, IN ORDER. The second half does not work without the first.

1. ONE REPRESENTATION. The server stores what Excalidraw renders. The agent-friendly shape (`label`, `text`, `startElementId`, `endElementId`, points as tuples) stays as INPUT at the API boundary and is converted once, on write, never on read. After that the stored document and the rendered document are the same bytes, and any divergence is a bug with an obvious test rather than an expected difference nobody can audit.

2. A WRITE RETURNS THE RESULTING DOCUMENT. A browser delta is still what goes up, because the baseline is the safety property that stops a stale tab truncating a board (TASK-016), and that must not be given up. What comes back is the whole board as the server now holds it, and the browser renders that rather than its own patched copy. Divergence then cannot accumulate over a session: every write is a resync.

WHAT MUST BE DESIGNED, NOT ASSUMED

- Applying a full scene while a human is mid-gesture. Excalidraw holds the document; replacing it under a finger that is dragging, or a cursor inside a text field, will fight them. This is a 75-inch touchscreen someone rearranges deliberately. Decide when the echo is applied and what happens to an in-flight interaction.
- Cost. A 300-element board is 293 KB. Echoing that on every write, against a measured median of 3.87 s between reports and a busiest second of 7, needs numbers rather than a shrug.
- Element ids. `regenerateIds: true` means the browser is already minting ids the server did not choose. Under one representation that has to stop, or be the server's job.
- Whether the agent path gets the same treatment. The user said "the server and the agent" too. A CLI write returning the resulting board is cheap to do and would kill the same class of drift for agents.

RELATED, NOT THE SAME. The stateless-server question (docs/design/stateless-server.md) is about whether memory or the vault is authoritative. This is about whether the server or the browser is authoritative, and about how many shapes the document has. They interact but they are separate decisions, and this one is the user's stated principle rather than an open question.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The server stores what Excalidraw renders; the agent-friendly shape is converted once on write and never on read
- [ ] #2 A write returns the resulting board and the browser renders that, rather than its own patched copy
- [ ] #3 The browser still sends a delta, so a stale tab still cannot claim a deletion for an element it never received
- [ ] #4 Applying a returned document does not disturb a human mid-gesture, shown against a real drag and a text edit
- [ ] #5 A check drives a long session of mixed agent and human writes and asserts the browser document and the server document stay identical
- [ ] #6 The cost of returning the document is measured, not assumed
<!-- AC:END -->
