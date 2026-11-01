---
id: TASK-559.37
title: Close the gaps that nothing uses between the cards of a dense placement
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T01:07:00Z'
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
- [ ] #1 A busy row does not widen the gap between the cards of a quiet row
- [ ] #2 A short straight line to a neighbour with a label takes only the room its label needs
- [ ] #3 Fit does not get worse than the far4 baseline of 86 of 112 readings at 0.6 or better, and the slowest reading stays under 500 ms
- [ ] #4 No relationship ends on a frame, and output stays deterministic
<!-- AC:END -->
