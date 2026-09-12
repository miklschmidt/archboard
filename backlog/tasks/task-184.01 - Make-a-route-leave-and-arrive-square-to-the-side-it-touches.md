---
id: TASK-184.01
title: Make a route leave and arrive square to the side it touches
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 15:22'
updated_date: '2026-09-12 16:07'
labels: []
dependencies: []
parent_task_id: TASK-184
ordinal: 338000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A route attaches to a port on a card's side and then goes wherever its first corridor is. When the first gap runs along the same axis as the side it just left, the route slides off the face instead of stepping away from it; and because a turn's rounding is sized from half its shorter leg, the last leg into a card can be short enough that the bend starts on the card's own edge. The arrowhead is then drawn on curved geometry at an angle to the side it points at, which is what the reader photographed.

What must survive: the planner's obstacle avoidance and containment, the label pill on the same path, the travelling dots on the same path, and the atlas. Diagnose from a real example with a runtime geometry probe rather than by reading the router.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A runtime probe over a real example measures, for every drawn route, the tangent at each endpoint against the normal of the side it attaches to, and the length of straight run before the first turn and after the last — and fails on the current router.
- [x] #2 Every route leaves its source and arrives at its target along that side's normal, in both grammars wherever a route attaches to a side.
- [x] #3 Each endpoint has a straight stub long enough that the arrowhead and the line's rounding sit entirely on straight geometry, with no rounding starting on a card's edge.
- [x] #4 Obstacle avoidance, containment, the page's own bounds and the atlas are unchanged; no route is capped or clipped to achieve any of the above.
- [x] #5 A label pill and the travelling dots still ride the same path as the line, and the picture stays deterministic.
- [x] #6 Visible QA confirms the approach on a real board in a real browser, on both grounds.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure before theorising: a runtime probe over real boards that reads every drawn route's endpoint, works out which side of which box it touches, and reports the angle against that side's normal and the length of dead-straight line before the first turn and after the last.
2. Read what it says rather than what the screenshot suggested, and fix what it actually finds.
3. Own it with a self-contained fixture that reproduces the crowding, and prove the owner red against each half of the old geometry separately.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What the probe found, which is not what the screenshot suggested

The tracked example was too small to show anything: 6 routes, every endpoint clean. Across all six boards of the isolated demo vault — 206 endpoints — the measurements were:

- **not square to their side: 0.** Every route already leaves and arrives along the normal. `waypoints` steps off a face into the corridor, and the arrival leg is built along the target side's axis, so the direction was never the problem.
- **too little straight line: 55.** The shortest approaches were 3.0 and 4.0 units where the arrowhead alone is 7.5.

Splitting those 55 by cause settled the fix: in 19 of 26 leaving-endpoints the leg was 13 to 21 units long and the rounding had eaten exactly half of it (21→10.5, 18→9, 13→6.5); in the other 7 the whole leg was 6.0.

So the reader's "rounded arrowheads tangent/angled" was two separate things, neither of them an angle:

1. **A corner takes its radius off both legs.** That is what makes an arc tangent to each, so the endpoint leg lost `min(legs)/2` to the turn and the head was drawn across the join.
2. **A track may sit `TRACK_CLEARANCE` from a card**, which was 6 — less than the head it has to carry.

## The fix

`APPROACH_STRAIGHT = 12` in `lib/design.ts`: the head (7.5) plus air, as a floor on the straight run rather than a fixed stub. `bendThrough` now takes what each of its legs must keep, and `curveThrough` reserves the approach on the first turn's incoming leg and the last turn's outgoing leg — a leg with room still rounds at `BEND_RADIUS_MAX`, and a leg too short to give twelve gives what it has and rounds not at all. `TRACK_CLEARANCE` rises from 6 to 12, so no track hugs a card closer than the head drawn against it.

Nothing was capped, clipped or moved off its corridor: the planner's channels, the port allocation, the obstacle avoidance and the containment are untouched, and the only geometric consequence is that two of six demo pages grew by six pixels (1658×895 → 1658×901, 1658×944 → 1658×950).

## Verification

- Re-measured on the same six boards, both grammars: **206 endpoints, 0 slanted, 0 below twelve.**
- The sequence grammar was not affected and is not changed: a message attaches to a lifeline rather than a box face, and its own marker inset already keeps the head clear.
- New owner `src/runtime/semantic-renderer/tests/route-approach.test.ts`, with a self-contained crowded fixture (two services with modules inside them, a datastore beside them, eight relationships). Proven red twice over: with the old `TRACK_CLEARANCE` alone (4 cramped endpoints) and with the old rounding as well.
- `bun test --isolate src/runtime/semantic-renderer` → 87 pass. Types and lint clean.

## Second finding: the self-loop

The reviewer's visible QA passed the ordinary heads and then found the one route that never went through the rounding at all. `selfLoop` built a single cubic from a card's face back to the same face, with control points reaching 26 out and spreading ±10, so both ends left and arrived about 21° off the side — a head drawn on a curve, pointing beside the card rather than at it.

It is built from orthogonal waypoints now — out square, down, square back in — and handed to `curveThrough` like every other route, so it gets the same reserved approach and the same rounding. The `SELF_LOOP_SPREAD` constant is gone: it only ever existed to bulge that cubic, and the loop's extent is now the reach it states.

Owned by two more cases in `route-approach.test.ts`: both ends of a self-loop square to the face with the full approach, and every point of the loop outside the card it belongs to. Proven red against the old cubic — both fail, the second because the old shape cut back inside the card's own edge.
<!-- SECTION:NOTES:END -->
