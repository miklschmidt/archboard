---
id: TASK-559.35
title: Fix kind chips, the tip edge and the pane focus outline
status: To Do
assignee: []
created_date: '2026-10-31T20:03:00Z'
updated_date: '2026-10-31T20:39:00Z'
labels: []
dependencies: []
parent_task_id: TASK-559
ordinal: 1007000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner, on 2026-10-31: chips in tips and in the legend look dark and faded, the left edge of a tip looks like AI slop, and the pane focus outline is cut off and adds nothing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A chip in a tip or the legend has the look of a card's chip
- [x] #2 A tip has no coloured left edge
- [x] #3 A pane draws no focus outline of its own
- [x] #4 What recedes leaves the lit parts and lines plainly on top
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chips: a kind shown only by doors passed the door's dark icon to the chip. TypeSample now strips that fill and draws the icon in the kind's colour, in the legend, the tips and PolicySample. The tip lost its coloured left edge. The outline was the browser's focus outline on the model-diagram section, which its pane clipped: it is outline-none now, as the canvas viewport already was, and the two-pane ring stays. Dim: --recede 0.3 to 0.14, pointer rest 0.5 to 0.24, a step's veil 0.28 to 0.16, a label 0.5 to 0.28.
<!-- SECTION:NOTES:END -->
