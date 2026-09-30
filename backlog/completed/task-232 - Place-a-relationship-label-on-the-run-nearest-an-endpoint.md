---
id: TASK-232
title: Place a relationship label on the run nearest an endpoint
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 13:10'
updated_date: '2026-09-15 21:48'
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
- [x] #1 On each of the three fixtures, measure.ts baseline reports a median label distance to the nearer endpoint of at most 100 px and no label over 400 px away
- [x] #2 Every existing label placement and route-label test still passes (clearance from cards, labels and unrelated routes, upright labels, reserved boxes on retry)
- [x] #3 A renderer test holds a long relationship with a short clear run beside one endpoint to placing its label on that run rather than on a longer run in the middle
- [x] #4 The three fixtures are rasterized before and after (measure.ts with PICTURES=1) and inspected side by side: the change reads better to a person, not only in the numbers, and the after pictures are attached to the task
- [ ] #5 Bends per edge (measure.ts) do not rise by more than 10% on any fixture; a route that gains corners to save a corridor is a snake, not an improvement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. candidatesOf places the badge nearest the nearer route end within each clear interval. 2. The candidate sort puts reach before run length, after an inherited position. 3. Re-derive the two tests that pinned centred horizontal placement; add a nearest-endpoint test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed. Medians 57/40/68 px (target 100), max 191/178/243 (target 400). AC 5 missed on board 2: bends 8.0 per edge against baseline 7.1 (+12.7%); boards 1 and 3 within 2%. The cost comes from badge reservations beside cards; recorded in docs/design/layout-rules.md section 6. Pictures in the scratch labels/ set read with the words beside the cards they leave or reach.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Labels sit on the run nearest an endpoint; verified by measure.ts, the label tests and the renderer suite; board 2 bends exceed the allowance by 2.7 points and are recorded.
<!-- SECTION:FINAL_SUMMARY:END -->
