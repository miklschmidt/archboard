---
id: TASK-044
title: Two more readers measure an arrow by its origin instead of its path
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:49'
updated_date: '2026-08-20 04:04'
labels: []
dependencies: []
references:
  - src/core/expand-elements.ts
  - src/server.ts
  - src/core/geometry.ts
  - src/core/labels.ts
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while implementing TASK-038, which fixed the general case and named these two as out of scope.

1. src/core/expand-elements.ts around line 181 places an arrow's expanded label at the midpoint of the FIRST segment (base.x + lastPt[0]/2), which is only correct for a two-point path. Any arrow with a waypoint gets its label put somewhere it does not belong. The skill actively recommends waypoints for routing around obstacles, so this is not a rare shape. labels.labelAnchorOf already knows the general rule: the midpoint of the middle segment, or the middle vertex of an odd-length path, which is Excalidraw's own.

2. GET /api/elements/search's bounding-box filter, src/server.ts around line 740, tests el.x and el.y alone. So it filters an arrow by its origin rather than by whether the arrow is in the region. Since an arrow's origin is its first point, a query for a region an arrow crosses can miss it, and a query for a region it merely starts in can catch it.

The second is a query surface rather than a product signal, so it is the lower stakes of the two, but both are the same mistake TASK-038 removed everywhere else.

src/core/geometry.ts now holds extentOf, measureLinear and isPathElement, and layout.boxOf is the one way to turn an element into a box. Both fixes are adoptions of those, not new logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An arrow with a waypoint gets its expanded label at the same place Excalidraw draws it
- [x] #2 The search bounding-box filter matches an element by its extent, so an arrow crossing the region is found and one merely starting in it is judged on the same rule
- [x] #3 A check covers a three-point arrow's label placement and a region query against a leftward arrow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/expand-elements.ts: replace the first-segment midpoint with labels.labelAnchorOf, which already knows Excalidraw's rule (the middle vertex of an odd-length path, the midpoint of the middle segment of an even one). The label box round it stays as it is; only the anchor was wrong.
2. src/core/geometry.ts: add overlapsRegion(element, region), an extent-versus-region overlap test, so the rule lives with the measuring and not in the route.
3. src/server.ts: swap the four-way origin comparison in GET /api/elements/search for one call to it. One predicate, nothing else in that file.
4. Say what the filter now means where it is described: the MCP query_elements bbox schema says 'origin (x, y)', and the CLI --bbox help.
5. Extend scripts/check-geometry.mjs: a three-point arrow expanded for export, asserting its label sits on the middle vertex and not halfway down the first segment; and region queries against the live server for a leftward arrow that crosses a region, one that only starts in it, and a box, checking the answer is the same rule for all three.
6. bun run type-check and bun run test, then revert each fix in dist and count the failures that reappear.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both fixes are adoptions of what TASK-038 already built.

src/core/expand-elements.ts now asks labels.labelAnchorOf where an arrow's label goes, instead of computing the midpoint of the first segment. The label box round the anchor is unchanged, so a two-point arrow exports exactly where it always did. labels.ts is pure, so importing it into expand-elements costs nothing at the bundle edge.

The search filter's rule went into src/core/geometry.ts as overlapsRegion(element, region): an extent-versus-region overlap test, inclusive on every edge. src/server.ts is one predicate and a region literal, as asked. Overlap rather than containment, because the criterion is that an arrow crossing the region is found. It is a superset of the old behaviour for boxes as well: an element whose origin was in range overlaps the range, so nothing that used to match stops matching, and a box that overlaps but starts outside now matches too. That is the same rule for everything, which is the point.

The MCP query_elements bbox description said 'only return elements whose origin (x, y) falls within the given coordinate range' and now says what it does. The CLI --bbox help never claimed the old rule; a comment at the call site records the new one.

Validation: scripts/check-geometry.mjs is now 54 checks, all passing. It covers a three-point arrow expanded for export (its label lands on the bend at (400,100), agreeing with labelAnchorOf, and a two-point arrow still labels itself halfway along) and four region queries against the live server: an arrow crossing the region from outside it, an arrow starting inside it, a box overlapping it whose top-left corner is outside, and a box 6000px away. Reverting src/core/expand-elements.ts and src/server.ts and rebuilding fails 4 of 54: the bent arrow's label goes to (250,200), which is on neither the arrow nor the rule, and neither the crossing arrow nor the overlapping box is found. The two that stay green under both rules are the invariants: what used to match still matches. bun run test exits 0 and bun run type-check passes for both projects.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two readers that measured an arrow by where it starts now measure it by where it goes.

Expanding a board for export invents the bound text element an arrow's label needs. It used to place it at the midpoint of the first segment, which is the right answer only for a two-point path, so every arrow with a waypoint carried its label somewhere off the arrow. It now asks labels.labelAnchorOf, which is Excalidraw's own rule: the middle vertex of an odd-length path, the midpoint of the middle segment of an even one. Waypoints are routine, not exotic, because the skill recommends them for routing round obstacles.

GET /api/elements/search's bounding-box filter tested x and y alone, so it asked where an element begins rather than whether it is in the region. It now calls geometry.overlapsRegion, a new extent-versus-region overlap test that lives with the rest of the measuring; src/server.ts carries one predicate and a region literal. Overlap, not containment, so an arrow crossing the region is found; and a superset of the old rule for everything, so nothing that used to match stopped matching. The MCP query_elements bbox description, which promised the old rule out loud, was rewritten.

Verified with scripts/check-geometry.mjs, now 54 checks: a three-point arrow expanded for export lands its label on the bend at (400,100) and agrees with labelAnchorOf, a two-point arrow still labels itself halfway along, and four region queries against a live server cover an arrow crossing the region from outside, an arrow starting inside it, a box overlapping it whose top-left corner is outside, and a box far away. Reverting both files and rebuilding fails 4 of 54; the two checks that stay green under both rules are the invariants. bun run test exits 0 and bun run type-check passes for both projects.
<!-- SECTION:FINAL_SUMMARY:END -->
