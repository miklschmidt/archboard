---
id: TASK-238
title: Re-derive the flank routing tests as reader invariants
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 21:27'
updated_date: '2026-09-15 21:44'
labels:
  - renderer
dependencies:
  - TASK-231
references:
  - docs/design/layout-rules.md
  - src/runtime/semantic-renderer/tests
ordinal: 409000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ten renderer tests pin the west-face design for forward skips leaving a hub (same-destination lane nesting, flank labels clearing corridors, predecessor flank routes, two crossing-bridge cases). They describe the current output, not what a reader needs, and every descent-based fix for the wide-board corridors fails them (docs/design/layout-rules.md section 3). Replace each with the invariant it protects: no route through a card, no ink in a margin corridor beyond a small share, a label on its own route and off others, a skip beside its own chain still drawn beside it when the target sits in the source column after layout, bridges where routes cross.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the ten tests either asserts a reader invariant that holds under engine-chosen skip faces or is removed with the reason recorded in the test file header
- [x] #2 measure.ts on the three fixtures owns the corridor and route-through-card invariants and runs in the module lane
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ten tests failed under engine-chosen faces at first; keeping the flank under a predecessor (pinned cards route a free skip as a staircase) brought seven back unchanged. Three were re-derived: comparison-labels asserts the inherited label stays on a horizontal run and no longer which row it shares; predecessor-routing asserts the label on a straight run of its own route, at most four bends and no card crossed instead of one flank lane; crossing-rounding asserts a bridge on every proper perpendicular crossing of the drawing instead of one crossing at one point. tests/wide-boards.test.ts holds the three fixtures to no route through a card, at most one west exit per card, and corridor, page and bend bounds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Flank tests re-derived as reader invariants and the wide-board fixtures held to measured bounds in the module lane; verified by the renderer suite.
<!-- SECTION:FINAL_SUMMARY:END -->
