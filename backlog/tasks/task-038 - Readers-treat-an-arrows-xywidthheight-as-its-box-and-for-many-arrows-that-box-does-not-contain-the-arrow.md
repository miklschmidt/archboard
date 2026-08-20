---
id: TASK-038
title: >-
  Readers treat an arrow's x,y,width,height as its box, and for many arrows that
  box does not contain the arrow
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 03:22'
updated_date: '2026-08-20 03:44'
labels: []
dependencies: []
references:
  - src/core/layout.ts
  - src/core/labels.ts
  - src/server.ts
  - src/core/compare.ts
priority: high
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while implementing TASK-034, verified there, deliberately left unfixed to keep that task honest.

Two defects in how arrow geometry is recorded and read. They compound.

1. An arrow's x,y is its FIRST POINT, not the top-left of its extent, and its points may be negative. So for an arrow that runs leftwards or upwards, the range x..x+width does not contain the arrow at all. archboard/dataflow has nine such arrows. Every reader that assumes a top-left-plus-size box places them wrongly: the scene bounding box, src/core/layout.ts, and therefore compare and describe, which are built on layout's signals.

2. rerouteBoundArrows writes an arrow's points and never re-measures its width and height, so the recorded size is stale on every arrow the server has moved. scripts/repair-labels.mjs has been quietly re-measuring them since TASK-024, which is why this stayed hidden.

Together: an arrow the server has re-routed has a stale size AND an origin that is not its top-left, and the readers that decide what compare reports believe both.

TASK-034's boundTextDrift is unaffected because it measures arrows from points rather than from the box. That is the pattern to generalise: derive an arrow's real extent from its points wherever a reader needs its position or size.

This matters beyond tidiness. layout.ts feeds the relative-position signals in compare and changes, which are what an agent narrates when a human rearranges the board. Those signals are the product.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An arrow's extent is derived from its points wherever a reader needs its position or size
- [x] #2 width and height are re-measured whenever an arrow's points change, including in rerouteBoundArrows
- [x] #3 The scene bounding box contains every arrow on a board, including ones running leftwards or upwards
- [x] #4 The relative-position signals in src/core/layout.ts place a leftward or upward arrow correctly, shown against a board that has them
- [x] #5 A check covers an arrow whose points run negative in both axes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make src/core/geometry.ts the pure home for element extent maths. It currently holds the async canvas ops (align, distribute, group, lock, duplicate) which pull in winston and canvas-client, so nothing frontend-safe can import it; move those to src/core/element-ops.ts and update the two importers (src/cli/commands/arrange.ts, src/core/mcp-dispatch.ts).
2. In geometry.ts add two pure functions, generalising what labels.ts's labelAnchorOf already does: measureLinear(points) gives the size of a path, and extentOf(element) gives the real axis-aligned box, taken from points when the element has them and from x/y/width/height otherwise. An element with points is measured from them whatever its type, so freedraw is covered too.
3. Have src/core/labels.ts's anchorSlack use measureLinear instead of its own copy, keeping labels.ts pure so the frontend can still import it.
4. Add boxOf(element) to src/core/layout.ts next to boundingBoxOf, so the one place that turns an element into a Box is the place that owns Box. Say in layout's doc comment why x,y is not a top-left.
5. Use it in src/core/describe.ts: the Item box, the scene bounding box, and the selection report.
6. Re-measure an arrow whenever the server writes its points: in resolveArrowBindings (which covers create, re-route and re-bind) and in the PUT handler when the body carries points. Keep the server.ts edit to those two spots.
7. Fix align and distribute in geometry's old body to place a linear element by its extent rather than by x + width.
8. Simplify scripts/repair-labels.mjs to re-measure through the shared helper rather than its own inline copy.
9. New scripts/check-geometry.mjs, wired into bun run test: pure checks including an arrow whose points run negative in both axes, and a live server check that builds a board of leftward and upward arrows, then asserts the scene bounding box contains them and that describe's cluster and region signals place them where they are drawn. Also assert a re-routed arrow's width and height match its points.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned, with two departures worth recording.

src/core/geometry.ts held the async canvas operations (align, distribute, group, lock, duplicate), which import winston and the fetch client, so nothing the browser loads could have imported it. Those moved to src/core/element-ops.ts and geometry.ts is now the pure measurement module: measureLinear, extentOf, remeasureLinear, isPathElement. Two import sites followed (src/cli/commands/arrange.ts, src/core/mcp-dispatch.ts). That is what lets src/core/labels.ts share the measurement rather than keep its own copy in anchorSlack, and labels.ts is imported straight into the frontend bundle.

The measurement decides by points, not by type name. Anything carrying a path is measured from it, so freedraw is covered and a linear type nobody has added yet is right by default rather than wrong until somebody remembers the file.

Readers now measuring rather than assuming: layout.boxOf (new, next to boundingBoxOf), describe (the Item box, the scene bounding box, clusters, reading order and the selection report), element-ops align and distribute, labels.anchorSlack, library-catalogue (stencil size and drop offset), scripts/repair-labels.mjs.

The server restates width and height wherever it writes a path: on create (POST /api/elements and the batch route, which covers an arrow bound to nothing), inside resolveArrowBindings (which covers re-routes and re-bindings), and on a PUT that carries points. Points win over a width the caller sent alongside them, because a width that disagrees with the path is the old arrow's.

Validation: bun run test passes end to end (exit 0), including the new scripts/check-geometry.mjs at 39 checks. bun run type-check passes for both projects. Both halves of the defect were confirmed reachable by the check: breaking extentOf in dist fails 15 of 39, including the scene box cropping the stray arrow and every layout signal; breaking the server re-measure fails 3 of 39, including the re-route.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 03:44
---
AC 1 is left unchecked on purpose. Two files were held open by other agents while this landed and still read an element's box as top-left plus size, so the invariant is not yet true everywhere.

src/core/compare.ts (TASK-035 holds it). Every site is a one-line adoption of layout.ts's boxOf:
  · unionBox at ~354 — a node's box, and a node is any element carrying the node id, arrows included
  · the primary-element ranking at ~475, which sorts by (width * height)
  · the multi-element spread warning at ~700, which builds Box literals by hand
  · the plain-element region at ~736 and ~802, which covers freedraw
  Containment at ~648 is fine as it stands: its candidates are rectangles, ellipses, diamonds and frames, none of which carry a path.

src/core/promote.ts (TASK-031 and TASK-030 hold it). Line ~413 picks a selection's primary by (width || 0) * (height || 0), so promoting a selection containing an arrow can pick the wrong element as the thing being named.

Everything else that reads a position or a size now goes through geometry.extentOf or layout.boxOf.
---
<!-- COMMENTS:END -->
