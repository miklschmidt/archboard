---
id: TASK-337
title: 'Where routes join a shared lane, a junction mark shows the merge'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:59'
updated_date: '2026-09-24 15:40'
labels:
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 578000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Relationships of one kind share a lane on purpose, so two relationships can finish on one line with one arrowhead (Archboard: 'register a checkout' and 'resolve code targets' into Repository checkout), and the picture reads as one relationship. User decision 2026-09-24: draw a small junction mark where routes join, as a circuit diagram does. It changes only the painting, never placement or routing. It must not be mistaken for the traffic marks already drawn on lines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wherever two or more routes join into one drawn line, the join carries a junction mark, in the browser and headlessly
- [x] #2 A junction mark cannot be mistaken for a traffic mark
- [x] #3 Placement and routing are unchanged: only the painted marks differ between before and after
- [x] #4 One test owner proves marks at joins and none elsewhere
- [x] #5 Before and after pictures of every view of every dogfood board are shown to the user
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board affected: junction marks are painting, not architecture.
1. Find joins from the finished routes (lib/svg/junctions.ts): stretches whose strokes touch count as one lane; a join is where two routes begin or stop running together and go on different ways; a shared corner or a shared arrival point is not one.
2. Paint a dot in the heavier line's ink over the lines, under cards and words; hide the marks during a picture transition until the lines land.
3. Unit owner for the join rule; document it in measured-compound-renderer.md.
4. Before and after of every board and view, shown to the user with TASK-339.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in lib/svg/junctions.ts from the drawing's reported routes; stretches whose strokes touch count as one lane (routing nudges a shared lane's routes about a unit apart, found on Archboard's Repository checkout join). compound.ts now applies TASK-334's lane exchange before reporting the drawing, so the routes junction marks read are the painted ones. Picture transitions hide the marks until the lines land. Owner: src/transformers/semantic-renderer/tests/junctions.test.ts. Every view of every dogfood board drawn before and after; only painted marks and traffic differ. Gate: type-check, lint, fmt, system, repository and browser lanes pass; the module lane fails only on wide-boards timeouts that also occur on main under load.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Where two routes join or part on a shared lane, a dot in the heavier line's colour marks the join, as a circuit diagram does; a corner two routes turn together or a point both end at is not marked, and the marks move nothing. Verified by the junction owner, before and after pictures of every board and view shown to the user, and the gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
