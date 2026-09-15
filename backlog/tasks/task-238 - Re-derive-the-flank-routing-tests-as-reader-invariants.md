---
id: TASK-238
title: Re-derive the flank routing tests as reader invariants
status: To Do
assignee: []
created_date: '2026-09-15 21:27'
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
- [ ] #1 Each of the ten tests either asserts a reader invariant that holds under engine-chosen skip faces or is removed with the reason recorded in the test file header
- [ ] #2 measure.ts on the three fixtures owns the corridor and route-through-card invariants and runs in the module lane
<!-- AC:END -->
