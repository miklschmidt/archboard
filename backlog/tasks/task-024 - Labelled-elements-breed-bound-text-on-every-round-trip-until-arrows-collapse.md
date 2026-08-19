---
id: TASK-024
title: Labelled elements breed bound text on every round-trip until arrows collapse
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 21:29'
updated_date: '2026-08-19 21:49'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 24000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A labelled element that round-trips through the browser gains no additional bound text elements
- [ ] #2 An arrow's geometry survives repeated sync cycles; height does not collapse
- [ ] #3 Existing polluted boards can be repaired, not just prevented
- [ ] #4 Regression test covers a labelled shape and a labelled arrow across several sync cycles
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce on an isolated canvas (PORT=3300, own browser tab): labelled rect + labelled arrow, force repeated sync cycles, count bound texts per cycle.
2. New pure module src/core/labels.ts (no imports, no DOM): boundTextIndex(), dropRedundantLabels(), planLabelRepair(). Shared by the frontend, the repair script and the regression check.
3. Containment in frontend/src/canvas/elements.ts: run dropRedundantLabels() before convertToExcalidrawElements so an element that already carries a live bound text element never has its label/text expanded again. An element with a label and NO bound text still gets one, exactly once.
4. Repair: scripts/repair-labels.mjs. Against a live board (--board, --port) or an .excalidraw file: keep one bound text per container, delete the rest, prune boundElements to the keeper, strip the now-stale label/text from the container, then trigger the server's own rerouteBoundArrows by re-PUTting each bound shape's geometry so collapsed arrow points are recomputed.
5. Regression check: scripts/check-labels.mjs, wired in as bun run test:labels. Drives dist/core/labels.js through a simulated expander that mimics convertToExcalidrawElements (mints a fresh text id whenever it sees a label) plus the server's merge semantics, across many cycles, for a labelled shape and a labelled arrow. Fails if any container ends with more than one bound text or an arrow's points degenerate.
6. Verify live on 3300 with a browser attached: many cycles, bound-text count stays 1 each, arrow height holds; then run the repair over the polluted /tmp/user-edits.excalidraw scene loaded onto 3300 and show the counts collapse to 1 and arrow geometry return.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced on an isolated canvas (port 3300, own browser tab, labelled rect + labelled arrow). Every agent-driven update that reaches the browser minted one extra bound text per touched labelled element: 3 elements -> 22 in 8 cycles, 19 of them text, boxA 9 / arr1 9 / boxB 1. Confirms the mechanism exactly.

Fix: new pure module src/core/labels.ts (dropRedundantLabels / boundTextsByContainer / planLabelRepair, no imports, no DOM) called from frontend/src/canvas/elements.ts immediately after validateAndFixBindings and before convertToExcalidrawElements. An element that already carries a live bound text element has its label/text seed removed, so the converter has nothing to expand; an element with a label and no bound text keeps it and still grows exactly one. Detection reads both directions of the binding (the text's containerId and the container's boundElements) because the two disagree while a board is half-synced.

Verified with the same scenario after rebuilding: 15 agent update cycles with a browser attached and the bound texts already server-side (put there by a real human drag) -> element count fixed at 6, exactly one bound text per container every cycle, arrow points tracking the moving shape correctly instead of degenerating.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:29
---
Found by dogfooding: the user adjusted arrows on archboard/dataflow, they 'shrunk to invisibility' and then vanished. Twice. Root cause is a feedback loop, evidenced end to end.

THE DATA. Board held 284 elements where ~41 were drawn. 253 were text. The five ARROW labels were duplicated 42x each ('changes', 'quiet', 'HTTP', 'stdio', 'WS'); shape labels only 3-5x. All 42 copies of 'HTTP' share one containerId, carry 42 DISTINCT Excalidraw-generated ids, and are all source=frontend_sync, created in bursts seconds apart. The arrow itself: boundElements grown to many text refs, version 40, and height 0.9999999999999716 — literally 1px tall. That is the invisibility.

THE LOOP. The server stores the agent-facing convenience field  on the element and never strips it once a real bound text exists — normalize.ts:134 actively re-adds it. On broadcast the frontend runs Excalidraw's convertToExcalidrawElements (frontend/src/canvas/elements.ts:225), which expands  into a NEW text element with a fresh random id. That is reported back as an upsert, the server keeps it AND keeps , and the next cycle mints another. Unbounded. Arrows are worst hit because they are rerouted most, and Excalidraw sizes an arrow's label region to its bound text — stack 42 and the arrow collapses.

WHY IT LOOKED LIKE DELETION. Adjusting a collapsed arrow triggers more cycles, making it worse. The user was fighting the feedback loop.

PREVIOUSLY SEEN, NOT CONNECTED. The excalidraw-skill's Error Recovery section describes 'duplicate text elements / element count doubling' as a known symptom with a manual cleanup, and the TASK-009 agent noted in passing that a labelled shape 'exports two bound text elements (frontend-synced one plus the <id>-label synthesised from the still-present label field)' and set it aside as pre-existing. Same root cause, twice observed, never diagnosed.

THE FIX is to make the bound text the single source of truth: drop / from the stored element once a bound text element exists. Evidence preserved as snapshot 'user-edits-evidence' and /tmp/user-edits.excalidraw.
---

author: @claude
created: 2026-08-19 21:29
---
CORRECTION to the comment above: unescaped backticks let the shell eat three words, so the key sentence is unreadable. The field name that went missing each time is: label

Restated cleanly, no backticks:

The server stores the agent-facing convenience field named label on the element, and never strips it once a real bound text element exists. normalize.ts:134 actively re-adds it. On broadcast, the frontend runs Excalidraw's convertToExcalidrawElements (frontend/src/canvas/elements.ts:225), which expands that label field into a NEW text element with a fresh random id. The frontend reports it back as an upsert; the server stores it and still keeps the label field; the next cycle mints another one.

So the fix is to make the bound text element the single source of truth: once one exists, the label and text fields must not persist on the stored element.
---
<!-- COMMENTS:END -->
