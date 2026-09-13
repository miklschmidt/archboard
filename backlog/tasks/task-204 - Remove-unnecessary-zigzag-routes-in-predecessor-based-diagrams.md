---
id: TASK-204
title: Remove unnecessary zigzag routes in predecessor-based diagrams
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 14:50'
updated_date: '2026-09-13 15:48'
labels: []
dependencies: []
references:
  - .archboard/vault/Semantic renderer.semantic.json
  - src/runtime/semantic-renderer
type: bug
ordinal: 363000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Semantic renderer Readable layout proposal (IV2KX3GX), Everything view, is hard to trace: long connections repeatedly zigzag through open space and overlap the deleted connection drawing. User prioritizes fixing this live Pane A rendering before implementing the approved vocabulary/style plan. Preserve semantic content, comparison visibility, and recognizable predecessor placement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repeatable regression reproduces unnecessary route detours on the reported board and catches the underlying routing pattern.
- [x] #2 The reported proposal renders traceable connections without unnecessary zigzags while preserving nodes, connections, labels and predecessor placement.
- [x] #3 Real-browser verification covers the reported Everything view and representative scoped/current views, with appropriate automated checks passing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Capture live drawing and construct a fast red-capable routing regression; minimize it, test ranked causes, correct the responsible layout behavior, and verify the original board in the browser. Keep the approved configuration implementation deferred.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced exact live12nodes/18edges with bun /tmp/archboard-route-repro.ts (~200ms): six routes have5–7 horizontal reversals. Browser DOM confirms seven reversals on placed exchange, literal colors and SVG return; same-view current predecessor has straight corridors. Valid normalized minimal7node predecessor→3node proposal with one return edge reproduces3 reversals within clear corridor; public renderer regression added red. Hypotheses shared before probes: dummy alignment, label seeding, endpoint constraints. Empty-layer-axis interpolation reduces full-board failures but does not fix minimal. Edge hint import requires direction/parent coordinate care. Preparing isolated gate so unfinished vocabulary patch stays deferred.

Cause isolated inside predecessor/ELK integration: dummy-only layer sampling, unshared corridor hints for endpoint detours, and missing coordinate transformation for original route hints. Candidate passes minimal no-zigzag regression and visually straightens long left/return routes. One residual9.5px size-cards badge detour is required to maintain20px separation from its neighboring label; preserve it rather than optimize a blind bend-count threshold. Parent inspected complete SVG in background browser preview. Final patch/tests and gate pending.

Candidate verified on35 rendered vault views with identical subject sets, and all21 root drawings byte-identical. Live Everything and Renderer integration/current views inspected. Independent review caught a new nested-container clearance regression caused by switching compound graphs to full INTERACTIVE crossing minimization; correcting it before final gate.

User reviewed live candidate and rejected remaining unnecessary card offsets and curly detours. Continuing same fix: Compound layout moves19 units horizontally from predecessor, SVG painters20, and Layout graph→Compound layout detours to x812 (the card left edge) although its endpoint and label are near x899–939. Investigating initial port coordinates and layer-local dummy spacing rather than accepting lower reversal counts as visual success.

Second visual pass isolated two further causes with3-node regressions: actual port positions were never seeded, causing bottom-attached edges to start corridor hints at card-left; layer-local forward packing pushed cards right for added west-side lane dummies. Port hints now remove127px gratuitous detour. Packing refinement retains predecessor card columns and restores dummy hints before fitting, avoiding stale displacement. Testing consistent same-face hints for newly added long connections before final visual acceptance.

User clarified placement priority: cards should retain predecessor positions; labels have no requirement to retain previous positions, and routes may vary. Remove historic label-position preference and recompute from current attachment/corridor geometry. Exact remaining direct edge has both attachments atx898.67 but old center hints939/942, causing a needless right detour.

Final fix preserves predecessor card columns, uses actual ordered port attachments and recomputes label/corridor hints without historical label coordinates. Live reported edge is a straight M898.67,471 L898.67,772. Twelve focused routing tests pass with prior-code red proofs. All35 vault drawings preserve subjects;21 root drawings are byte-identical. Nested-boundary review passed after hierarchy-aware crossing correction. Isolated bun run check passed:2829 module tests,155 system tests,8 repository-policy tests and12 serial browser owners; root unrelated unfinished level configuration remains outside this validation snapshot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed unnecessary predecessor-route zigzags and card shifts by correcting hint coordinates, ordered port positions and flexible lane packing. Verified on the reported live Everything/scoped/current diagrams,35 vault drawings, independent nested-container review and the full isolated check gate.
<!-- SECTION:FINAL_SUMMARY:END -->
