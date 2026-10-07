---
id: TASK-439
title: A sequence card casts no shadow on its lifeline
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:49'
updated_date: '2026-10-07 01:59'
labels: []
dependencies: []
ordinal: 722000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a sequence diagram, the shadow of a participant card still lies over the top 5 units of its dashed lifeline (TASK-435 left this open). The lifeline starts 6 units under the card and the shadow reaches further. A shadow on a line is a defect that the owner already had fixed for the lines of architecture pictures. The participant shadows live in the sticky head group so that they move with the head, which is why a plain move under the columns does not work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No shadow shape of a card, of an activation bar or of a label lies over any lifeline or message in a sequence diagram, in both themes
- [x] #2 The lifeline keeps its dashes and its look, and its dash pattern runs on without a jump where it starts
- [x] #3 The sticky head still moves with its shadows when the picture scrolls
- [x] #4 The height of the sequence diagram changes by no more than the room that the fix needs, and the report names it
- [x] #5 A renderer test holds that no shadow shape overlaps a lifeline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Keep participant shadows in the sticky head and give lifelines enough room to start below their full extent. Preserve dash phase, place activation and label shadows below all columns and messages, and measure the height change. No architecture board is affected: the sequence painter keeps its existing ownership and public interfaces.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Lifelines now begin 13 units below participant cards: SHADOW_REACH (12) plus one unit of air, with a positive dash offset of 7 preserving the original phase from the former 6-unit start. Each flow grows by 7 units; the public SEQUENCE fixture changes from 379 to 386 units high (frame 339 to 346), with width unchanged at 804. The sticky head retains participant shadows and extends its opaque shade through their full 12-unit reach. Activation and label shadows now share the layer below every column and message, with participant/step membership and activation/label part hooks; removed subjects cast none. The row-mark test helper now distinguishes shadows from row marks. Simplification removed an empty column-layer SVG group. Scoped validation: 33 tests pass across sequence-shadows, sequence-marks, sequence-joins and dataflow; new renderer tests check both themes, actual participant-shadow reach against all lifeline strokes, shared shadow ordering, sticky-head ownership/shade coverage and retained dash phase. Changed production and test files pass scoped lint, and formatting is applied.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sequence lifelines start beyond the participant shadow. Activation and label shadows sit below all lines. Rendered owners pass with a seven-unit height increase per flow. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
