---
id: TASK-074
title: 'A write returns the resulting document, and the pane renders it'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:15'
updated_date: '2026-08-20 23:25'
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
- [x] #1 POST /api/elements/changes returns the board elements alongside its counts
- [x] #2 A pane applies the response to its own write as the whole document, and keeps merging another writer broadcast by id
- [x] #3 The browser still sends a delta computed against its own baseline, so TASK-016 safety property is unchanged
- [x] #4 Applying an echo produces no outgoing change report
- [x] #5 A pane with an undelivered local drag does not lose it when another writer broadcast arrives
- [x] #6 bun run test is green, with check-boards, check-side-by-side and check-changes specifically exercised
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: POST /api/elements/changes returns `document` — the board's whole element array — for a browser-origin write. Agent-origin keeps its small answer (TASK-075 shapes it).
2. Frontend: reportChanges surfaces `document`; sendReport applies it through applyServerScene (whole document, inside settle()'s suppression) when the scene has not diverged since the report was built, and otherwise keeps today's baseline assignment. Another writer's broadcast keeps merging by id.
3. The delta going up is untouched: still diffAgainstBaseline against this tab's own baseline.
4. Prove: extend check-changes with the response shape; the byte-identity and no-bounce assertions land in TASK-076's browser check.
5. Revert-proof each half and count the failing checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED.

Server, src/server.ts. POST /api/elements/changes answers a browser-origin write with `document`: the board's whole element array, alongside the counts it already returned. An agent-origin write keeps its small answer (TASK-075 shapes it).

Pane, frontend/src/canvas/useCanvasSession.ts. sendReport applies that document through applyServerScene — the whole document, inside settle()'s suppression, the same path initial_elements and board_switched use. Another writer's broadcast still merges by id through applyServerElements, untouched.

THE IN-FLIGHT GUARD IS COUNTED, NOT DIFFED. The response cannot be missing what the pane just sent, but it can be missing an edit made during the round trip. A diff against the report's own next baseline was the first attempt and it was wrong: another writer's broadcast landing in the same window reads as local divergence, so the resync was refused on nearly every interleaved cycle — which is most cycles in a session with an agent in it. localEditsRef counts onChange calls that pass scheduleReport's two gates (touched, and not suppressed), so it counts hands and not news.

TWO DIVERGENCES THE NEW CHECK FOUND, both fixed here because a write cannot return a document the renderer has to repair.

1. index. The store never held one: buildCreatedElement did not issue it and only the note exporter restated it, so an agent-created element reached the pane with no index, Excalidraw assigned one on render, and the two documents disagreed for the rest of the session. repairIndices in src/core/expand-elements.ts now gives every element on a board a valid index — REPAIR, not restatement: an index already increasing is kept, so a delete near the front does not rewrite 300 of them and report 300 changed elements. indexPosition is the inverse of fractionalIndex, and returns null for a key from Excalidraw's wider scheme, which is then reissued from ours. `index` is now a declared field on ExcalidrawElementBase.

2. A deleted container left its label behind. settleDeletions in the same file: a bound text goes with the container it names, boundElements entries pointing at what has gone are dropped, and startBinding/endBinding pointing at it are nulled. elementsForScene was quietly making the first two repairs on delivery, which is the definition of the pane and the server holding different documents.

Both run in settleDocument at the end of every write, and the elements they changed are folded into what the write reports, so a pane and an agent both learn what the board became. The single-element routes (POST /api/elements, PUT /:id, DELETE /:id, POST /batch) call the same two directly.

REVERT-PROOF, all against scripts/check-live-session.mjs (TASK-076), which is the only check that can see any of this because it is the only one with a real Excalidraw holding the document.

- Drop `document` from the server response: 2 assertions fail. First divergence on cycle 2 — `store (ellipse) .label: server {"text":"typed at 2"} / pane <absent>`, the label seed accumulating on the server while the pane never sees it.
- Stop the pane applying it: the same 2, with the same first divergence.
- Revert repairIndices: 2 fail, first on cycle 1 — `arr1 (arrow) .index: server <absent> / pane "a8"`. check-boards, check-labels, check-obsidian-md and check-fixed-point all still pass with it reverted, so nothing else in the suite can see it.
- Revert settleDeletions: 2 fail, first on cycle 7 — `Jm8q5Hy3 (text "Service 5") .containerId: server "svc5" / pane null`. Cycle 7 is the first delete of an agent-created box, so a three-cycle check could not have reached it.

bun run test is green, 21 suites, and check-fixed-point still reports 0 of 12 elements changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
POST /api/elements/changes answers a browser's write with the board's whole element array, and the pane renders it as the document rather than folding one more delta into a running total. Another writer's broadcast still merges by id, so a pane holding an undelivered drag keeps it. The in-flight guard counts human onChange calls rather than diffing, because a diff cannot tell a hand from another writer's news arriving in the same window. Two divergences the new browser-session check found are fixed on the way: the store never issued `index`, so every agent-created element was repaired by Excalidraw on render, and a deleted container left its label pointing at nothing. Verified by scripts/check-live-session.mjs over 42 cycles of interleaved writes; each of the four pieces was reverted in turn and each made it fail, three of them with a divergence no other suite noticed.
<!-- SECTION:FINAL_SUMMARY:END -->
