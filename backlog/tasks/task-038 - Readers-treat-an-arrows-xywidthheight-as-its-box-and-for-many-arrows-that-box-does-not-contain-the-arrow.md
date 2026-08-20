---
id: TASK-038
title: >-
  Readers treat an arrow's x,y,width,height as its box, and for many arrows that
  box does not contain the arrow
status: To Do
assignee: []
created_date: '2026-08-20 03:22'
updated_date: '2026-08-20 03:22'
labels: []
dependencies: []
references:
  - src/core/layout.ts
  - src/core/labels.ts
  - src/server.ts
  - src/core/compare.ts
priority: high
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while implementing TASK-034, verified there, deliberately left unfixed to keep that task honest.

Two defects in how arrow geometry is recorded and read. They compound.

1. An arrow's x,y is its FIRST POINT, not the top-left of its extent, and its points may be negative. So for an arrow that runs leftwards or upwards, the range x..x+width does not contain the arrow at all. archboard/dataflow has nine such arrows. Every reader that assumes a top-left-plus-size box places them wrongly: the scene bounding box, src/core/layout.ts, and therefore compare and describe, which are built on layout's signals.

2. rerouteBoundArrows writes an arrow's points and never re-measures its width and height, so the recorded size is stale on every arrow the server has moved. scripts/repair-labels.mjs has been quietly re-measuring them since TASK-024, which is why this stayed hidden.

Together: an arrow the server has re-routed has a stale size AND an origin that is not its top-left, and the readers that decide what compare reports believe both.

TASK-034's boundTextDrift is unaffected because it measures arrows from points rather than from the box. That is the pattern to generalise: derive an arrow's real extent from its points wherever a reader needs its position or size.

This matters beyond tidiness. layout.ts feeds the relative-position signals in compare and changes, which are what an agent narrates when a human rearranges the board. Those signals are the product.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An arrow's extent is derived from its points wherever a reader needs its position or size
- [ ] #2 width and height are re-measured whenever an arrow's points change, including in rerouteBoundArrows
- [ ] #3 The scene bounding box contains every arrow on a board, including ones running leftwards or upwards
- [ ] #4 The relative-position signals in src/core/layout.ts place a leftward or upward arrow correctly, shown against a board that has them
- [ ] #5 A check covers an arrow whose points run negative in both axes
<!-- AC:END -->
