---
id: TASK-559.37
title: Close the gaps that nothing uses between the cards of a dense placement
status: Done
assignee:
  - '@claude'
created_date: '2026-11-01T01:07:00Z'
updated_date: '2026-11-01T03:56:00Z'
labels:
  - renderer
dependencies: []
references:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
ordinal: 1009000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reads the dense placement as forced and mechanical: a busy gap in one row or column of the grid holds apart the cards of every other row, because contraction takes only bands that are empty across the whole page. The owner wanted less randomness, not a forced grid. Alignment stays where it costs nothing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A busy row does not widen the gap between the cards of a quiet row
- [x] #2 A short straight line to a neighbour with a label takes only the room its label needs
- [x] #3 Fit does not get worse than the far4 baseline of 86 of 112 readings at 0.6 or better, and the slowest reading stays under 500 ms
- [x] #4 No relationship ends on a frame, and output stays deterministic
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the band contraction with one-dimensional compaction: each card, frame wall, word plate and run of a line is a piece with a mover. Pieces that share a slab of the page keep their order and their room.
2. Solve the least whole shifts, bring stations back together while parting gains little, and let doors and bends take back stretched lines.
3. Keep the existing complete geometry guard as the proof, with no second route.
4. Read route measures in the ranking on the drawing as routed, and read room on what contraction left.
5. Measure the corpus against far4, look at the real pictures, and run the complete check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Mechanism: planned/compact holds the pass and planned/compact/sheet.rs holds the pieces. planned/room.rs took with_room. Axis moved to crate::geometry, which replaced the copy in routes/drawn_lines.rs.
Measured on the final core against far4, 112 readings: fit 0.6 or better 94 from 86, below 0.4 2 from 3, mean 0.804 from 0.765, area 152.2M from 175.3M. Slowest reading, three runs on a quiet machine: 528, 470 and 485 ms (Voice agent backend). Two runs produced identical SVGs for all 112 readings.
Native corpus of 113 graphs: 0 routes cross a card, 0 cross a label, 0 lines end on a frame they do not name.
Readings with a worse fit: Model reading 1473x1188 to 1581x1506 (-0.088, line length 11913 to 7615) and Walkthrough recording 1420x932 to 1089x1294 (-0.011).
Shop: all four readings fall in area and rise in fit, but Inventory service grows in height from 563 to 620 and Stock API from 408 to 639, against Gate 4 of docs/design/reader-redesign.md, which says at or below its size today.
The complete check found a defect that the corpus measures missed: squeezing stretched a title's band with the far wall of its frame, so the band went negative in width and a tab stopped being an obstacle. A band now slides with the near wall and keeps its width. folded-parent-line.test.ts owns it.
Tests changed: a_global_saving_keeps_a_callers_compact_fan and its fixture gave way to a unit test in reading.rs, because the old test passed with spreads_fan forced false and the new one fails under that mutation. The block-packing assertion that Voice session stands below Pane session is gone: the dense placement decides that board, not the FILLS rule of the packing, and the winning grid now has both in one row at a better fit.
Not taken: a stub rule per line end in place of APPROACH saves 0.26 percent of area and changes the output.

Six more runs of the measure gave a slowest reading of 464 to 483 ms. The 528 ms above was one run among nine.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dense placements now close the space that nothing uses. Compaction moves each card, wall, word plate and line run by whole units and keeps order only against what shares its slab, so a busy row no longer holds apart the cards of a quiet row, and a short labelled line takes the room of its label (runCommand to Command execution: 207 to 139, with a label 86 wide). Fit at 0.6 or better rose from 86 to 94 of 112, the slowest reading takes 464 to 485 ms with one run of nine at 528 ms, output is deterministic, and the complete check passes. Risk: Inventory service and Stock API in Shop grow in height against Gate 4, and Model reading and Walkthrough recording lose fit.
<!-- SECTION:FINAL_SUMMARY:END -->
