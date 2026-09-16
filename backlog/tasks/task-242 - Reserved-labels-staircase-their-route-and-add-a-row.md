---
id: TASK-242
title: Reserved labels staircase their route and add a row
status: To Do
assignee: []
created_date: '2026-09-16 00:23'
labels:
  - renderer
  - layout
dependencies: []
priority: medium
ordinal: 413000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a badge finds no clear run, the label is reserved with the engine, which puts it in its own layer as a label node. Two things follow on the 2026-09-16 "Semantic renderer" board: the row costs about 150 units of height per reservation, and the route through the label node staircases (Card measurement -> Compound layout steps sideways twice, 140 units each, to pass through "card and label sizes"; Architecture layout -> Edge routing loops left, down and back for "route relationships"). The user asked whether horizontal runs were forgotten: they were not, the horizontal runs on those routes are shorter than the badge plus its two 24-unit clearances, so the vertical run held the badge and the route around it is the engine's.

Options measured or to measure: (1) place the reserved label node under the source port rather than at the barycentre, so the route through it needs one step, not two; (2) after a reservation, try the label on the new straight run through the label node and drop the node's width to the lane width; (3) grow the between-row gap for non-straight edges too, only when it removes a reservation (measured: no gain on this board, and +21% on fixture 3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reserved label's route steps sideways at most once between its source and target on the Semantic renderer board
- [ ] #2 Fixture pages in docs/design/wide-board-layout-fixtures do not grow by more than 5% in area
- [ ] #3 The renderer suite and bun run check pass
<!-- AC:END -->
