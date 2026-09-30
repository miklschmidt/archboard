---
id: TASK-076
title: >-
  A check that a long mixed agent and human session keeps both documents
  identical
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:16'
updated_date: '2026-08-21 09:23'
labels: []
dependencies:
  - TASK-074
  - TASK-071
references:
  - docs/design/server-is-the-truth.md
  - scripts/check-changes.mjs
priority: high
type: task
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 7 of docs/design/the-plan.md. This is acceptance criterion 6 on TASK-065 and it is the check that makes the whole source-of-truth change worth having. Without it, "the server is the truth" is a claim rather than a property.

WHAT IT DOES. Drive a long session of mixed agent and human writes against one board and assert that what the pane holds and what the server holds stay byte-identical throughout, not merely at the end.

WHAT THE SESSION HAS TO CONTAIN, because a short happy path proves nothing:

- Agent creates, including labelled shapes and bound arrows, so the server mints ids the pane never named.
- Human drags, resizes, retypes a label and deletes an element, arriving as change reports.
- Both interleaved closely enough that an echo lands while another write is in flight.
- At least one element written by both sides.
- Enough cycles to catch something that grows by one each time. TASK-024 took many round-trips to reach 42 copies of one label, and a check that runs three cycles would not have caught it.

HOW TO COMPARE. Serialise both sides with the same key ordering and ignore only what is genuinely allowed to differ: `version`, `versionNonce`, `updated` and the server's own `createdAt`, `updatedAt` and `syncedAt` timestamps. State the ignore list in the script, because an ignore list that grows quietly is how this check stops meaning anything.

FAIL LOUDLY AND USEFULLY. When they diverge, print the element id, the field, both values, and the cycle number it first diverged on. A check that says "documents differ" on a 55-element board costs an hour before anybody knows what happened.

WHETHER IT NEEDS A REAL BROWSER. Probably, for the human half, and TASK-071 will have settled how a check drives one. If a socket standing in for a pane can produce the same interleaving, that is cheaper and fine, but say which was chosen and why: a fake pane that converts nothing cannot catch a divergence caused by conversion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check drives many cycles of interleaved agent and human writes on one board, including labelled shapes, bound arrows, a rename and a delete
- [x] #2 It asserts the pane document and the server document are byte-identical after every cycle, not only at the end
- [x] #3 The list of fields it ignores is stated in the script, and is limited to version, versionNonce, updated and the server own timestamps
- [x] #4 A divergence is reported with the element id, the field, both values and the cycle it first appeared on
- [x] #5 It is part of bun run test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A new check, scripts/check-live-session.mjs: a real headless browser holding one board, 42 cycles of interleaved agent and human writes, the two documents compared after every cycle.
2. The agent half posts through the changes route; the human half arms the pane with one real trusted click and then drives edits through the live Excalidraw instance's own updateScene, so the debounce, the delta, and the echo all run as they do in use.
3. Compare in the page, as strings: agent-browser's eval reformats doubles, and a width the page holds as ...531 arrives as ...533.
4. Report a divergence with the element, the field, both values and the cycle it first appeared on; state the ignore list in the script.
5. Add to bun run test; prove the zero is real with a planted divergence and by reverting the code under test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED as scripts/check-live-session.mjs, `bun run test:live-session`, in the chain.

WHY 42 CYCLES. TASK-024's label gained a copy every trip round the loop and had 42 before a person found it obvious enough to report, so 42 is 'as many trips as that bug needed to become visible without a check'. Then the number earned itself: writing this check found two real divergences, and the second — a deleted container leaving its label pointing at a shape that was gone — first appears on CYCLE 7, because that is the first cycle in which the human deletes a box the agent made. Three cycles would not have reached it; neither would five. The rotations are 5 agent moves against 4 human ones, so every pairing has happened by cycle 20 and 42 runs the table twice.

WHAT A CYCLE IS. One agent write — a labelled shape, a bound arrow, a move, a recolour, or a relabel through the `label` seed — then one human write in the pane, without waiting for the agent's broadcast to land, so an echo is in flight while the pane computes its own delta. The human's rotation is move, resize, retype a bound label, delete. Both sides write the same element on 21 of the 42 cycles, and the agent creates 17 elements the pane never names.

HOW THE HUMAN IS DRIVEN, and what that does not cover. Excalidraw's gestures cannot be aimed — the canvas is one DOM node, and check-fixed-point already measured that synthetic pointer events do not reach its handlers. So the human's hands are ONE real trusted click, which is what arms the pane to report at all, and then edits through the live instance's own `updateScene` via the React fiber. That fires the same onChange, so the debounce, the delta against the baseline, and the echo all run as they do in use. Excalidraw's own pointer handling is not exercised and the script says so.

THE COMPARISON HAD TO MOVE INTO THE PAGE. `agent-browser eval` returns values as JSON and a double does not always survive: a text width the page held as 107.81990051269531 arrived here as ...533, two units in the last place away, and the check spent a while reporting its own transport as a divergence. So the element-to-strings function is injected into the page — the same function, sent through toString(), rather than two spellings of one comparison — and only strings cross. Object keys are sorted recursively, because the two sides build `startBinding` in different key orders and the note is canonicalised either way; nothing else is normalised and floats are compared exactly.

IGNORED, and stated in the script: version, versionNonce, updated (Excalidraw's per-mutation bookkeeping) and createdAt, updatedAt, syncedAt, source, syncTimestamp (the server's own, all five stripped by cleanElementForExcalidraw on the way into the pane, so the pane has never held them). `source` and `syncTimestamp` are not timestamps and are named out loud rather than folded into 'the server's own'. Nothing else — index, seed, boundElements, containerId, rawText, points all count.

CONVERGENCE, NOT INSTANTANEOUS EQUALITY, and the script says so: a write is in flight for a moment and the pane is briefly behind, so each cycle polls until the two agree or six seconds pass. What is asserted is that every cycle ENDS agreed.

PROOF THAT THE ZEROS ARE REAL. Built in: right after the mid-drag assertion the pane is holding a drag the server has not been told about, and the comparison must name `auth (rectangle) .x` — a run where the read-back had quietly stopped working would report agreement there too. And by reverting the code under test, all four caught, three of them by nothing else in the suite:

- server `document` dropped from the response: 2 assertions, first divergence cycle 2
- pane stops applying it: the same 2, same cycle
- repairIndices reverted: 2, cycle 1 — `arr1 (arrow) .index: server <absent> / pane "a8"`
- settleDeletions reverted: 2, cycle 7 — `Jm8q5Hy3 (text "Service 5") .containerId: server "svc5" / pane null`

COST. About 20 seconds. It skips the build when dist/frontend is newer than every source, so the two browser checks build once between them; the whole chain is 97 seconds on this machine, of which the two browser checks are about 35. It asserts navigator.userAgent says headless, like check-fixed-point, because a mapped window steals focus under Hyprland.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
scripts/check-live-session.mjs drives 42 cycles of interleaved agent and human writes against one board in a real headless browser and asserts the pane's document and the server's are identical after every cycle, naming the element, the field, both values and the cycle a divergence first appeared on. 42 because TASK-024's label needed that many trips round the loop to become visible without a check, and because the second divergence this check found — a deleted container leaving its label behind — first appears on cycle 7, so three cycles could not have reached it. The comparison runs inside the page, as strings, because agent-browser's eval reformats doubles and the check was briefly reporting its own transport. Proven by reverting each of TASK-074's four pieces in turn: every one fails it, and three of them fail nothing else in the suite.
<!-- SECTION:FINAL_SUMMARY:END -->
