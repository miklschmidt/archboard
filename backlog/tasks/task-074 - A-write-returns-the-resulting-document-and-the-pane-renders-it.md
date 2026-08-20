---
id: TASK-074
title: 'A write returns the resulting document, and the pane renders it'
status: To Do
assignee: []
created_date: '2026-08-20 20:15'
labels: []
dependencies:
  - TASK-072
  - TASK-069
references:
  - src/server.ts
  - frontend/src/canvas/useCanvasSession.ts
  - docs/design/server-is-the-truth.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: enhancement
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 7 of docs/design/the-plan.md. The user's stated principle, in one sentence: "Submitting a diff to the server should cause a write, and the server should return the full resulting document."

WHAT CHANGES.

- `POST /api/elements/changes` at `src/server.ts:1272` returns the board's elements alongside the counts it already returns.
- The pane applies the response to its OWN write, through the existing scene-apply path, inside the existing `settle()` suppression.
- Another writer's broadcast keeps merging by id, exactly as `applyServerElements` at `frontend/src/canvas/useCanvasSession.ts:289` does today.

WHY ONLY ITS OWN WRITE. A pane holding 400 ms of undelivered drag that receives a full document computed without that drag would lose it. The response to a pane's own write is computed from what that pane just sent, so it cannot be missing it. A third party's broadcast can be, so it stays a merge. That keeps "render the persisted document" for the pane that wrote, without letting somebody else's echo overwrite local work in flight.

THE DELTA STILL GOES UP. This does not change what the browser sends. It still reports `upserts` and `deletes` computed against the baseline of what that tab has received, because that baseline is what stops a stale tab claiming a deletion for an element it never received (TASK-016, ADR 0015). That safety property is not being given up.

WHAT IS ALREADY SETTLED, SO DO NOT REDESIGN IT.

- WHEN THE ECHO IS APPLIED: immediately, on arrival, with no gate. Measured with real trusted input. A drag survived 70 writes to another element over 8.4 seconds and 40 writes to the element being dragged; the human won both times, because Excalidraw recomputes a dragged element from a pointerdown snapshot plus the pointer delta on every move, so an intervening `updateScene` is simply overwritten. A text editor survived 18 full-document applies over 9 seconds with focus and every typed character intact.
- WHETHER IT NEEDS THE MUTEX: no. The echo is safe to apply on its own, so this does not wait for TASK-067.
- WHAT IT COSTS: 3.4 ms extra at 55 elements and 14.0 ms at 300, on a response that was already being sent. It cannot touch drag latency, because the report is a 400 ms trailing debounce and the echo therefore arrives after the gesture is over.
- THE ONE THING THAT DOES HARM: an id changing under an open text editor, which silently discards typing. That is TASK-069's job and this task depends on it being done.

BOUNCING. `updateScene` fires `onChange`, which schedules a report. The `suppressRef` counter in `settle()` already covers this, and once the document is native the diff is empty anyway, so this is belt and braces rather than new machinery. Assert it rather than assuming it: applying an echo must not produce an outgoing report.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /api/elements/changes returns the board elements alongside its counts
- [ ] #2 A pane applies the response to its own write as the whole document, and keeps merging another writer broadcast by id
- [ ] #3 The browser still sends a delta computed against its own baseline, so TASK-016 safety property is unchanged
- [ ] #4 Applying an echo produces no outgoing change report
- [ ] #5 A pane with an undelivered local drag does not lose it when another writer broadcast arrives
- [ ] #6 bun run test is green, with check-boards, check-side-by-side and check-changes specifically exercised
<!-- AC:END -->
