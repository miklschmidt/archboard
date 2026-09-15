---
id: TASK-232
title: Place a relationship label on the run nearest an endpoint
status: To Do
assignee: []
created_date: '2026-09-15 13:10'
updated_date: '2026-09-15 13:23'
labels:
  - renderer
dependencies:
  - TASK-226
references:
  - docs/design/wide-board-layout.md
  - src/runtime/semantic-renderer/lib/layout/label-runs.ts
priority: medium
type: bug
ordinal: 392000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/wide-board-layout.md measures the three Flask module maps in docs/design/wide-board-layout-fixtures: the label pass in src/runtime/semantic-renderer/lib/layout/label-runs.ts picks the longest clear run of a route, which on a long relationship is the corridor or the row approach hundreds of pixels from either card. The median distance from a label to the nearer of its endpoints is 233 to 335 px at baseline and half or more of the labels sit over 200 px away, so a reader tracing a line has to travel to find out what it says. Shorter routes (TASK-231, TASK-233) help but do not fix it; the preference for the run nearest an endpoint that can hold the label is not in the pass. Existing tests for clearance from cards, other labels and unrelated routes stay the standard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On each of the three fixtures, measure.ts baseline reports a median label distance to the nearer endpoint of at most 100 px and no label over 400 px away
- [ ] #2 Every existing label placement and route-label test still passes (clearance from cards, labels and unrelated routes, upright labels, reserved boxes on retry)
- [ ] #3 A renderer test holds a long relationship with a short clear run beside one endpoint to placing its label on that run rather than on a longer run in the middle
- [ ] #4 The three fixtures are rasterized before and after (measure.ts with PICTURES=1) and inspected side by side: the change reads better to a person, not only in the numbers, and the after pictures are attached to the task
- [ ] #5 Bends per edge (measure.ts) do not rise by more than 10% on any fixture; a route that gains corners to save a corridor is a snake, not an improvement
<!-- AC:END -->
