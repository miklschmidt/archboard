---
id: TASK-366
title: Junction dots recede with a presented step unless a line they join is lit
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 00:47'
updated_date: '2026-09-29 00:51'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 607000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dots and bars that mark where routes join or part are painted with no subject id, so the presentation veil never dims them: under a step about some cards, junction dots of unrelated lines stay at full strength over faded lines (reported 2026-09-29 on the Board viewer walkthrough). Group regions had the same gap (TASK-364), fixed by listing their members in data-members, which the veil dims and markVeil lights while a member is lit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While a presented step veils the picture, a junction mark stays at full strength only when a relationship that joins or parts there is lit; every other junction mark recedes with the rest
- [x] #2 Each junction mark lists the relationships that meet at it, and a renderer test owns that list
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected: a mark gains an attribute and the veil helper of the viewer is generalized; no part or relationship moves.
1. svg/junctions.ts: each junction carries every route that joins or parts at it (joinsBetween, keep, markOf), and junctionMarks writes their relationship ids as data-members on each circle or bar.
2. MEMBERS_ATTRIBUTE moves to svg/standing.ts beside data-traffic; regions and junctions share it, and the veil stylesheet already dims [data-members].
3. Viewer: the helper of markVeil lights any mark that lists a lit subject (lightByMembers), regions and junctions alike.
4. Tests: junctions.test.ts asserts the routes a join and a gathered bar carry; resting-streak.test.ts asserts that every drawn junction mark lists at least two relationships of the board on both engines.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: junctions, resting-streak, group-regions and viewer tests 189 pass; lint, type-check and fmt clean. Browser: Board viewer walkthrough step 1 on a scratch server over a copy of .archboard/vault: all four junction marks unlit at opacity 0.28 (none sits on a lit line), and the dots reported in the screenshot recede with their lines.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Junction dots and bars now list the relationships that meet at them (data-members, shared with group regions), so a presented step dims every junction whose lines it is not about and lights one that joins a lit line. Verified with renderer tests on both engines and the Board viewer walkthrough in headless Chromium.
<!-- SECTION:FINAL_SUMMARY:END -->
