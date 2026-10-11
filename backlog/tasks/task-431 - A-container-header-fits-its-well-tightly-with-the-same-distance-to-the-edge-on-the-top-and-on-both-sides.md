---
id: TASK-431
title: >-
  A container header fits its well tightly, with the same distance to the edge
  on the top and on both sides
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 787000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner measured the header slab of a container in the dark theme (screenshot /home/msc/Pictures/Screenshots/screenshot-2026-10-07--00:51:09.png). The distance from the outer edge of the container to the header is about 1.6 times larger at the top than at the left (the top wall is 7 units and the side walls 3, plus a gap of 5 on each). The owner wants the header to look friction fit in the well, with the same distance to the edge on the top and on both sides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The distance from the outer edge of a container to its header slab is the same on the top, the left and the right, and small enough that the slab looks friction fit, with a gap of no more than about 2 units to the walls, in both themes
- [x] #2 The walls keep their light from above (the top wall in shade, the side walls quieter, the bottom wall lit), the lines of the container still leave from the foot of the slab, and the sequence frame follows
- [x] #3 Layout is measured on the Web shop, Agent workbench and Nesting check boards, the room under the header stays as TASK-420 made it, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 437f3ae12. design.ts: one wall thickness TRAY_WALL 6 for the top and both side walls (TRAY_SIDE removed), WELL_GAP 2, HEADER_SLAB_INSET 8 from the outer edge on the top, left and right (HEADER_SLAB_TOP removed). Light from above kept: top wall shade 0.8/0.45 of the floor toward --slab-deep, side walls 0.4/0.28 (lighter, equal), bottom the lit lip 2 + crease 1. Measured on Web shop, Nesting check, Agent workbench, both engines: outer edge to slab 8 on top, left, right; gap to the walls 2; slab foot to first row 20 where no line turns (99 to 155 with lines and labels, as before); side to cards 20 from the outer edge (14 of floor past the 6-unit wall); bottom 20. Box widths unchanged (760, 844, 380, 340, 300, 1874); header heights 83 to 79 and 100 to 96; words at x 60 as before. Sequence frame follows (slab 8 from the frame's edge). Renderer tests 571 pass. Renders: scratchpad proposals/slabs-s/friction-ab (zoom/ with 8x corners).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Container headers keep equal outer margins and a two-unit wall gap. Measured layouts and header owners pass on the named boards. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
