---
id: TASK-038
title: >-
  Readers treat an arrow's x,y,width,height as its box, and for many arrows that
  box does not contain the arrow
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:22'
updated_date: '2026-08-20 04:00'
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
- [x] #1 An arrow's extent is derived from its points wherever a reader needs its position or size
- [x] #2 width and height are re-measured whenever an arrow's points change, including in rerouteBoundArrows
- [x] #3 The scene bounding box contains every arrow on a board, including ones running leftwards or upwards
- [x] #4 The relative-position signals in src/core/layout.ts place a leftward or upward arrow correctly, shown against a board that has them
- [x] #5 A check covers an arrow whose points run negative in both axes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Adopt layout.boxOf in src/core/compare.ts everywhere a reader still builds a box out of x, y, width, height: unionBox (a node's box, arrows included), the primary-element ranking that sorts by area, the multi-element spread warning that hands clusterBoxes hand-built Box literals, and the plain-element region at both the first pass and reframeRegions.
2. Check the containment pass rather than trusting the note that says it is fine, and adopt boxOf there too if the candidates can carry a path.
3. Adopt geometry.extentOf in src/core/promote.ts where a selection's primary is picked by (width || 0) * (height || 0), so promoting a selection that holds an arrow names the shape a human would name.
4. Extend scripts/check-geometry.mjs with a compare and promote section: a board whose nodes carry leftward arrows, read through buildBoardModel, asserting the node box covers the arrow, the primary is the shape and not the arrow, the spread warning does not fire on a node that is not scattered, and a plain leftward arrow-shaped element lands in the region it is drawn in.
5. bun run type-check and bun run test, then prove the checks bite by reverting each fix in dist and counting the failures that reappear.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned, with two departures worth recording.

src/core/geometry.ts held the async canvas operations (align, distribute, group, lock, duplicate), which import winston and the fetch client, so nothing the browser loads could have imported it. Those moved to src/core/element-ops.ts and geometry.ts is now the pure measurement module: measureLinear, extentOf, remeasureLinear, isPathElement. Two import sites followed (src/cli/commands/arrange.ts, src/core/mcp-dispatch.ts). That is what lets src/core/labels.ts share the measurement rather than keep its own copy in anchorSlack, and labels.ts is imported straight into the frontend bundle.

The measurement decides by points, not by type name. Anything carrying a path is measured from it, so freedraw is covered and a linear type nobody has added yet is right by default rather than wrong until somebody remembers the file.

Readers now measuring rather than assuming: layout.boxOf (new, next to boundingBoxOf), describe (the Item box, the scene bounding box, clusters, reading order and the selection report), element-ops align and distribute, labels.anchorSlack, library-catalogue (stencil size and drop offset), scripts/repair-labels.mjs.

The server restates width and height wherever it writes a path: on create (POST /api/elements and the batch route, which covers an arrow bound to nothing), inside resolveArrowBindings (which covers re-routes and re-bindings), and on a PUT that carries points. Points win over a width the caller sent alongside them, because a width that disagrees with the path is the old arrow's.

Validation: bun run test passes end to end (exit 0), including the new scripts/check-geometry.mjs at 39 checks. bun run type-check passes for both projects. Both halves of the defect were confirmed reachable by the check: breaking extentOf in dist fails 15 of 39, including the scene box cropping the stray arrow and every layout signal; breaking the server re-measure fails 3 of 39, including the re-route.

Finished in a second pass, once compare.ts and promote.ts were free.

Six adoptions, all of layout.boxOf or geometry.extentOf, no new logic:
compare.ts unionBox (now boxOf plus boundingBoxOf, so a node holding a path-carrying element covers it), the primary-element ranking, the containment candidates, the multi-element spread warning, and the plain-element region in both the first pass and reframeRegions; promote.ts's pick of the biggest labelled shape.

The comment's containment judgement held, with one correction to the reasoning next to it. CONTAINER_TYPES is rectangle, ellipse, diamond and frame, none of which carries a path, so that site could not be wrong today. It was adopted anyway, because it is one line and the rule should not have an exception nobody can see. The correction is to the line above it: a node's elements never include an arrow, because buildBoard skips connectors when it groups by node id. The element that carries a path into a node is a freedraw, a shape drawn by hand and then promoted, and that is what the check uses. Arrows do reach promote.ts, which does not filter connectors, so that site is exercised with an arrow.

Only four of the five compare sites are independently observable. The plain-element region computed in the first pass is overwritten by reframeRegions on every path through compareBoards, so no check can distinguish them; both were fixed.

Validation: scripts/check-geometry.mjs grew a pure compare-and-promote section and is now 46 checks, all passing. Reverting src/core/compare.ts and src/core/promote.ts and rebuilding fails 5 of 46, one per observable site: the node box reads 2600x1900 instead of 1300x950, the scattered-node warning fires on two nodes that are not scattered, the node is reported as a freedraw rather than the box it is, the stroke's region is bottom-right where its origin is rather than centre where it is drawn, and promotion names the node 'calls' after the arrow instead of 'Payments' after the box. bun run test exits 0 and bun run type-check passes for both projects.
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An arrow, and anything else carrying a path, is now measured from that path everywhere the board is read.

The first pass made src/core/geometry.ts the pure measurement module (extentOf, measureLinear, remeasureLinear, isPathElement), added layout.boxOf as the one way to turn an element into a Box, moved the canvas operations out to src/core/element-ops.ts, and had the server restate width and height wherever it writes points: on create, inside resolveArrowBindings, and on a PUT carrying points. describe, align, distribute, labels.anchorSlack, library-catalogue and repair-labels all measure rather than assume.

The second pass finished AC 1 in the two files that were held open at the time. src/core/compare.ts adopted boxOf at five sites: unionBox, the primary-element ranking, the containment candidates, the multi-element spread warning, and the plain-element region in both passes. src/core/promote.ts adopted extentOf where it picks the biggest labelled shape to name a node after. All six are adoptions, not new logic.

Two corrections to the record. Containment really was safe as it stood, because CONTAINER_TYPES carries no path; it was adopted anyway so the rule has no invisible exception. But a node's elements never include an arrow, because buildBoard skips connectors when it groups by node id, so the path-carrying element inside a node is a freedraw. Arrows do reach promote.ts, which does not filter connectors.

Verified with scripts/check-geometry.mjs, wired into bun run test and now 46 checks: the four directions an arrow can be drawn in, a path negative in both axes, a bent path, a freedraw stroke, a live server holding a board of leftward and upward arrows read back through the scene box, the cluster and region signals and the selection report, and a pure compare-and-promote section over a board of leftward strokes. Every fix was shown to bite by reverting it: extentOf reverted in dist fails 20 of 46, the server re-measure fails 3, and reverting src/core/compare.ts and src/core/promote.ts and rebuilding fails 5, one per observable site (node box 2600x1900 instead of 1300x950, a scattered-node warning on two nodes that are not scattered, the node reported as a freedraw rather than the box it is, the stroke placed bottom-right where its origin is rather than centre where it is drawn, and promotion naming the node 'calls' after the arrow instead of 'Payments' after the box). bun run test exits 0; bun run type-check passes for both projects.
<!-- SECTION:FINAL_SUMMARY:END -->
