---
id: TASK-423
title: >-
  A container is a neutral well, and its header is a slab that takes its color
  from the groups like a card
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 12:58'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 710000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants the color taken out of containers. The header of a container must render like a card slab: a raised slab that rises from the floor to meet the canvas level, with a clear margin round it, so that the depth of the well (the pocket of the container) stays visible. The floor of the container is ever so slightly darker than the canvas. The color of a container header comes from the groups, like the color of a card, and no longer from the kind of the container. This replaces the kind tint of the container body and the nameplate (TASK-412, the body tint of TASK-413 era work, ADR 0038 and ADR 0044 rules 3 to 5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The floor, the walls and the header of a container have no color of its kind: the floor is a neutral that is only ever so slightly darker than the canvas in both themes, and the walls are neutral shades
- [x] #2 The container header is a slab with a top face, front edge and soft shadow. TASK-431 sets a two-unit gap to its top and side walls.
- [x] #3 A container in a group takes the tint of its header face and the color of its front edge from its placing group, by the same recipe as a card, and a container in no group has a neutral header. The icon chip keeps the color of the kind
- [x] #4 The lines that the container sends out still leave from the foot of the header slab, the far view, the sequence frame, the standing marks (TASK-421) and the selection ring work, and nested wells are cut one step deeper
- [x] #5 ADR 0038, ADR 0044 and DESIGN.md say how a container is drawn and colored, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Completion evidence: update Semantic renderer@TASK-423 to the neutral tray, group-tinted header slab, separate port geometry and shared near/far content. Preserve existing ids and document the later TASK-428 and TASK-430/431 refinements rather than restore superseded choices. Compare, inspect against source, adopt, and run dogfood check. The material improvement is a renderer board whose ownership and paint order describe the built product.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 7e5c5880b. A container is a neutral well: --tray-floor light 0.974 (page 0.99), dark 0.185 (page 0.2); --tray-sink dark 0.15; --tray-plate, washed() and DEEPEN removed. The header is a card's slab (cardLook, the same function as a card) standing on the floor: WELL_GAP 5 (lib/design.ts), HEADER_SLAB_INSET = TRAY_SIDE + 5 = 8, HEADER_SLAB_TOP = TRAY_WALL + 5 = 12; ARCHITECTURE_HEADER_PADDING moved to design.ts as 8 + 16 = 24. Header colour from the placing group (nodeAppearances), neutral without one; kind colour only on the chip. Removed HEADER_GAP, CONTAINER_TOP_PAD, FLOW_PLATE_FOOT, PLATE_THICKNESS, HEADER_ROOM, plateFace. Measured on Web shop, Nesting check, Agent workbench, both engines, every variant: floor gap above the slab 5, left 5, right 5; header slab foot to first row 20 where no line turns (99 to 171 where lines and labels stand there, unchanged from HEAD); box side to cards 20 (17 of floor past the 3-unit side wall); bottom 20. Boxes are as wide as at HEAD; header heights +4 (79 to 83, 96 to 100). Sequence frame: slab 5 inside the walls, heads 18 under its foot and 18 from the sides; heads stand 16 lower than at HEAD. Marks: outline on the header slab's face, pin on the box corner, well unmarked. Before and after: scratchpad proposals/slabs-s/well-ab (zoom/, marks/).

Architecture completion (2026-10-07): Semantic renderer@TASK-423 adopted at version 30. Added bound Tray surfaces (tray.ts), Card ports (ports.ts) and Near and far content (far-card.ts), and narrowed Slab surfaces to raised slabs, seats, standing borders and shadows. Corrected the three existing slab relationships in place: architecture labels/shadows, sequence seats/helper slabs, and SVG shared definitions without the removed hatch. Seven new relationships carry the tray, port and content mechanisms. Evidence: measured-cards.ts:121 calls tray and :156 calls paintCardViews; tray.ts:141 calls slabShadow and :142 slab; architecture.ts:391/392 plans ports, :225 paints their inside and :417 extends pulses; document.ts:294 adds portDefinitions; dataflow.ts:345 calls tray and :346 paintHeadingViews. TASK-431 supersedes the earlier 5-unit gap with 2 units, equally 8 units from the outer top and sides. TASK-430 supersedes closed far ports; TASK-435 places card shadows under cards. The source comparison preserves every old subject id and the predecessor was untouched before adoption. Rasterized and inspected the proposal. Isolated dogfood check passed with diagnostics: []. No acceptance criteria or status changed by this documentation work.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: The header of a container is a slab like a card: a top face, a front edge and a soft shadow, standing on the floor with its top face level with the canvas, with a clear margin round it on the top and both sides that equals the room inside the well elsewhere, so that the walls and the depth of the well still show

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Container wells are neutral, and their header slabs inherit the placing group color. The accepted tight inset preserves the visible walls. Header and tray owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
