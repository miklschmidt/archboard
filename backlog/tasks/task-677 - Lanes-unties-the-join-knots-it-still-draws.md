---
id: TASK-677
title: Lanes unties the join knots it still draws
status: To Do
assignee: []
created_date: '2026-11-24T03:54:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A knot is two join marks within two lanes of each other, or a join mark within a lane of a hop; the renderer scorecard counts them (packages/renderer/tests/runtime/support/drawn-junctions.ts). refactor/remove-track (#151) cut them from 79 to 25 over the Lanes corpus by keeping trunks and crossing runs two lanes apart and moving a line out of its trunk where that unties more knots than it ties and crosses no more lines. One case of knot is left that this rule does not reach.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The scorecard counts no junction knot on the Lanes readings of the corpus, or each one left is named with the reason it stays
- [ ] #2 A layout test fails on a knot of the remaining case
- [ ] #3 Crossings and page area over the Lanes corpus do not grow
<!-- AC:END -->
