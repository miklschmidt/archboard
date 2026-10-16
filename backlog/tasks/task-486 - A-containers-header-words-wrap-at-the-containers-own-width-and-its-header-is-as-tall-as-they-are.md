---
id: TASK-486
title: >-
  A container's header words wrap at the container's own width, and its header
  is as tall as they are
status: To Do
assignee: []
created_date: '2026-10-16 13:00'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 851000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A container's header slab is measured before layout, as a card is: its words wrap at a card's widest (340 px less the slab inset) and the header row takes the height of those lines. Layout then makes the container as wide as what it holds, often far wider, and the slab is stretched to that width while its words keep the narrow wrap. In the near view a long responsibility stands as a tall narrow column at the left of a wide empty slab; the far view wraps the name to the final width (measurement.ts farWrap) but keeps the tall header row, so zoomed out the header is mostly empty. Seen on 2026-10-16 on the flow frame of a flowchart (Device Trust Control Plane, view 'Certificate lifecycle and protected access'), and it holds for every container. The blocks engine lays each container out as a block of its own from the inside out (lib/blocks), so a header can be measured once its block's width is known; the track engine lays the whole board out in one Graphviz layout with the header as a ranked row (lib/track/spacing.ts), so it needs another way. The wide boards are already over their time bounds (TASK-377), so the fix must not lay a board out twice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the near view a container's responsibility wraps at the width of the container's header slab as drawn, on both engines and in flowchart frames
- [ ] #2 A container's header row is as tall as its words need at that width, so no header keeps room for lines it no longer has
- [ ] #3 The far view of a header fits the same header row
- [ ] #4 No vault drawing lays out more slowly than before: the wide-board corpus times are measured before and after on a quiet machine
- [ ] #5 A test fails if a header's words wrap narrower than the slab they stand on
<!-- AC:END -->
