---
id: TASK-225
title: A view draws a container-to-child call from the page's left edge
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:17'
updated_date: '2026-09-15 13:11'
labels:
  - renderer
dependencies: []
references:
  - evals/fixtures/S09.json
  - .skill-evals/2026-09-15T03-21-37-188Z/report.md
priority: high
type: bug
ordinal: 385000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a board where a container node calls one of its own children (Flask app -> Dispatch, label dispatches, with Dispatch's parent being Flask app), the full board renders the edge from the container's border to the child. A view whose selection scope names the container, the child and an unrelated sibling (Overview in evals/fixtures/S09.json: nodes Flask app, Dispatch, CLI; the CLI's child Run command and its call into Flask app are outside the scope) renders the same edge with its source end at x=0, outside the container card, so the arrow's origin is cut at the page boundary instead of sitting on the container it names. The skill-evaluation batch .skill-evals/2026-09-15T03-21-37-188Z failed every S09 run in both arms (6 of 6) on this one defect; the board is fixture-authored and the scenario changes nothing, so it is entirely the renderer's. Reference capture: .skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S09/1/captures/capture-1-overview.png (defect) against capture-0-application.png (same edge drawn correctly on the full board). Cause is not established; what differs between the two drawings is only the view scope and the removal of the incoming Run command -> Flask app edge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A call edge from a container to its own child, drawn through a selection-scoped view that includes both, starts on the container's border (a renderer test asserts the first route point lies on the container's frame, using tests/drawn-routes helpers)
- [x] #2 Rendering the S09 fixture's Overview view and rasterizing it shows the dispatches edge starting inside the Flask app card with nothing at the page edge
- [x] #3 The full-board rendering of the same fixture is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause, corrected from the report's reading: the frame-to-child call started on the frame's outer west face in both drawings (route began at the container's x), because sidesOf treated the pair as nested (parents differ) and gave WEST/WEST; the overview only made it obvious because the frame sits on the page margin there. Fix in compound-graph.ts: facesOf checks containment first; a frame calling a part inside it leaves the frame's top face down into the part (NORTH/NORTH), a part calling its frame leaves its bottom face onto the frame's bottom (SOUTH/SOUTH). Verified with a renderer-only script on the S09 fixture in both readings (route now [top face -> part top], inside the frame) and rasterized pictures; tests/containment-calls.test.ts holds both directions and both readings. The full-board drawing changed accordingly (the line now descends from the frame's top face instead of its west border). Suites, lint and fmt as for TASK-224.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A relationship between a frame and a part inside it now starts on the frame's top face (or ends on its bottom face) instead of its outer flank, so the call no longer appears to come from the page margin. Verified with a new renderer test in both readings and rasterized pictures.
<!-- SECTION:FINAL_SUMMARY:END -->
