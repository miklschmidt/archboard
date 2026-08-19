---
id: TASK-024
title: Labelled elements breed bound text on every round-trip until arrows collapse
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 21:29'
updated_date: '2026-08-19 22:08'
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

REVISED THE FIX after the first version broke renaming. Dropping the label seed once a bound text exists stops the duplication but makes labels immutable: 'update <id> --set {"text": ...}' became a silent no-op on any board a browser had rendered, because the browser holds a bound text the update can never reach. Verified live — the board kept showing the old name.

Final design (src/core/labels.ts): the label seed stays authoritative for what a label SAYS; the bound text element is fixed as the thing that says it. planLabelExpansion() decides per element — no bound text yet, expand normally and get one; bound text saying the same thing, remove the seed so the converter has nothing to expand and pass the text element through untouched; bound text saying something else, withhold it from the converter so the label is rebuilt properly (measured, positioned) and record its id. adoptReusedLabelIds() then renames the rebuilt label back to that id and rewrites every reference to the invented one. So the count is pinned at one per container while a rename still renames, and Excalidraw's seed/versionNonce/version/index are carried over so a re-expansion that changes nothing reads as no change (no churn).

It also repairs a one-directional binding: where only the text names its container, the reference back is restored. Without that, a shape whose boundElements never synced went blank — caught by screenshot, now covered by a check.

normalize.ts:134 is NOT implicated. Converting text -> label on the update path is correct and the fix depends on it; the culprit was purely that convertToExcalidrawElements mints a new id for every label it sees. normalize.ts is unchanged.

Also corrected the excalidraw-skill Error Recovery entry, which described this as an auto-sync quirk and advised never labelling background zones. Both wrong; labelling is safe.

VERIFICATION (isolated canvases on 3301/3302, my own browser tab, port 3000 untouched).

Before the fix, 3 elements -> 22 in 8 agent update cycles, 19 of them text, boxA 9 / arr1 9.

After: labelled rect + labelled arrow, bound texts pushed server-side by a real human drag, then 15 agent update cycles -> element count fixed at 6 every cycle, exactly one bound text per container, arrow points tracking the moving shape (~333 -> ~291) instead of degenerating. Then 10 rename rounds interleaved -> still 6 elements, still one label each, and the two text element ids never changed while their text followed the rename. Screenshot confirms the canvas shows the latest names.

Renaming with the bound text browser-only (no human edit at all): 'IdentityService' and 'gRPC' both render, 6 elements in the pane. This is the case the first design broke.

REPAIR (scripts/repair-labels.mjs, live board or saved file): loaded the polluted evidence scene onto 3302 — 294 elements, 263 text, 18 containers duplicated, five arrow labels 42x each, arrow points including [[0,3.96e+28],[-0.49,3.96e+28]] and [[-1.2e+52,...]]. Repair -> 53 elements, worst container 1 bound text, 241 duplicates deleted, 8 containers re-bound, 14 arrow binding refs restored and every arrow rerouted through the server's own rerouteBoundArrows (by re-stating each anchor shape's geometry — no duplicated maths), 15 arrows re-measured. Screenshot shows a readable architecture diagram again. Then a human drag + 12 agent cycles + a rename on the repaired board: still 53 elements, worst container 1, zero degenerate arrows.

REGRESSION CHECK: scripts/check-labels.mjs, wired in as 'bun run test:labels' and into 'bun run test'. Models all three parties headlessly (a converter written to duplicate exactly like the real one, the pane's baseline diff, the server's merge-not-replace upsert) and asserts across 25 cycles for a labelled shape AND a labelled arrow. 34 checks. Its first assertion is that the model still reproduces the bug with containment removed, so it cannot pass by being toothless — confirmed by mutation: stubbing planLabelExpansion fails 18 checks, stubbing adoptReusedLabelIds makes a label vanish entirely. Full suite green (mcp/bind/obsidian/changes/labels/library).

KNOWN RESIDUAL, unchanged by this fix and worth its own task: the stored label seed is never updated when a HUMAN retypes a label in the browser, so the next conversion pass rewrites their text back to the seed. That was already the behaviour (the old code re-expanded the stale seed into a duplicate that won), so this is not a regression — but with labels now singular it is visible as a revert rather than as litter.
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
