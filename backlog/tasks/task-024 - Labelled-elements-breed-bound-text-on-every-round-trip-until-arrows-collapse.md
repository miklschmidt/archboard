---
id: TASK-024
title: Labelled elements breed bound text on every round-trip until arrows collapse
status: To Do
assignee: []
created_date: '2026-08-19 21:29'
updated_date: '2026-08-19 21:29'
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
<!-- COMMENTS:END -->
