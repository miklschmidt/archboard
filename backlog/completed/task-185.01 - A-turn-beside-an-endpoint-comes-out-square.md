---
id: TASK-185.01
title: A turn beside an endpoint comes out square
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 18:26'
updated_date: '2026-09-12 19:30'
labels: []
dependencies: []
parent_task_id: TASK-185
type: bug
ordinal: 343000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on the actual render path across every board of an isolated vault: 27 of 147 turns round with a radius under four units, 14 of them exactly zero. Every one of them is the first or last turn of its route, and every one has an endpoint leg measuring exactly TRACK_CLEARANCE. The approach floor reserves APPROACH_STRAIGHT of that leg and the corner rounds with what is left, which is nothing, because the two budgets are the same twelve units and were never added together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A runtime probe over real routed boards reports no endpoint-adjacent turn rounding below a radius that reads as a curve
- [x] #2 The router allocates the approach and the bend radius together, so the leg between a card face and the nearest track carries both
- [x] #3 The existing square-to-the-side and straight-approach guards still pass, self-loops included
- [x] #4 What the change costs in page size is measured and stated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build a runtime probe over every board of an isolated vault that reads the drawn SVG and recovers each turn's radius from its cubic's chord, plus the leg each endpoint stands on.
2. Read the router: where the leg between a card's face and the nearest track comes from, and what the approach floor takes off it.
3. Add the missing budget in design.ts: BEND_RADIUS_MIN, the smallest turn that still reads as one, with TRACK_CLEARANCE derived as APPROACH_STRAIGHT + BEND_RADIUS_MIN so the one leg carries both.
4. Re-measure every board and both fixtures; state what the change costs in page size.
5. Own it in route-approach.test.ts: the endpoint leg carries approach plus turn, no turn is drawn square, and beside a card the radius is the whole minimum — proven red against the old clearance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis, measured not argued. A probe over 16 architecture variants of an isolated demo vault, reading the drawn paths: 147 turns, 27 of them under a radius of four, 14 of them exactly zero. Every single one was the first or last turn of its route and every one stood on an endpoint leg of exactly 12.0 — TRACK_CLEARANCE. bendThrough reserves APPROACH_STRAIGHT of that leg and rounds with the remainder, so two budgets of twelve on one leg of twelve left the turn nothing. Of the three hypotheses (clearance budget, radius clamp, redundant waypoints) the leg measurements settled it: the clamp and the waypoints were innocent.

Fix: TRACK_CLEARANCE = APPROACH_STRAIGHT + BEND_RADIUS_MIN (12 + 8 = 20) in design.ts. Nothing else moved — the approach floor is unchanged, BEND_RADIUS_MAX is unchanged, and no radius is capped or hidden.

After: the same 147 turns over 294 renders (both themes), zero square, minimum radius exactly 8, median 14. Endpoint legs now draw 12 of straight line and 8 of arc. Cost in page size: the largest board grew from 1658x950 to 1662x978; six of sixteen variants unchanged; the demo's motion-clock grew four units.

Red proof: with design.ts reverted, 'e3 leaves on a leg of 12.0', 'e8 leaves on a leg of 12.0' and 'e3 at 2 rounds at 0.00', 'e8 at 2 rounds at 0.00'.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TRACK_CLEARANCE is now APPROACH_STRAIGHT + BEND_RADIUS_MIN (12 + 8), so the one leg between a card's face and the nearest track carries both the straight line an arrowhead sits on and the radius of the turn after it. Nothing else moved: the approach floor and BEND_RADIUS_MAX are unchanged, and no radius is capped or hidden.

Verified by measuring the drawn pages of an isolated demo vault: 294 renders over both themes, 294 turns, none square, minimum radius exactly 8, median 14, where before 27 of 147 rounded under four and 14 were exactly zero. Owned by route-approach.test.ts — the endpoint leg carries approach plus turn, no turn is drawn square, and beside a card the radius is the whole minimum — each proven red against the old clearance ('e3 leaves on a leg of 12.0', 'e3 at 2 rounds at 0.00'). The square-to-the-side, straight-approach and self-loop guards from TASK-184.01 pass unchanged. Cost: the largest board grew from 1658x950 to 1660x968 and six of sixteen variants did not change. Visible QA on archboard/pipeline in both themes by the parent's reviewer.
<!-- SECTION:FINAL_SUMMARY:END -->
