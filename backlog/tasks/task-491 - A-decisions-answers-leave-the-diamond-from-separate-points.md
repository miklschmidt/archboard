---
id: TASK-491
title: A decision's answers leave the diamond from separate points
status: To Do
assignee: []
created_date: '2026-10-17 10:38'
labels:
  - renderer
dependencies: []
type: bug
ordinal: 856000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A flowchart decision with two answers sends both lines out of the diamond's bottom point and splits them below it (owner screenshot of 2026-10-17: 'Which caller drives the library?' on Device Trust Control Plane, 'Enroll through the in-process Rust library'). A flowchart reads a decision by its answers leaving from different points: left and right, with the bottom for a third. Commits 1288fba17 and 3de5226c4 move each line end to the diamond's point on the side the layout made it cross; the track engine makes every answer cross the bottom, so all of them meet there. Moving the ends after layout is not enough: an answer whose label stands inside the diamond's width would double back under the diamond.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A decision with two answers draws one line from its left point and one from its right point, each leaving sideways before it turns down to its answer
- [ ] #2 A decision with three answers draws them from its left, bottom and right points
- [ ] #3 No line leaving a side point runs back under or through the diamond
- [ ] #4 A test fails on the old code when two answers leave the same point
- [ ] #5 Every flowchart view of both vaults is rendered before and after, and each changed drawing reads the same or better
<!-- AC:END -->
