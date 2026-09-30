---
id: TASK-221
title: Shorten skipped connections and preserve straight label corridors
status: Done
assignee:
  - codex
created_date: '2026-09-15 02:40'
updated_date: '2026-09-15 03:17'
labels: []
dependencies: []
type: bug
ordinal: 381000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Semantic renderer@Readable layout sends its new Compound layout to SVG painters connection around the far left because skipped dependencies require WEST/WEST ports. User wants left exits retained but top entry allowed. The unchanged literal colors edge also develops an unnecessary bend despite being straight in the baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skipped forward connections retain left exits and can enter the target top, avoiding the reported detour.
- [x] #2 The reported literal colors comparison route stays on one clear vertical corridor with its label.
- [x] #3 Renderer regressions and original-board visual checks preserve card and label clearance.
- [x] #4 Remaining crossings between the new connection and removed routes have visible bridges where routes have room.
- [x] #5 Inherited size-cards and routed-edges labels preserve their placement relative to the Current variant, including size cards aligned with route relationships.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce both route failures through the public renderer. 2. Correct skipped-edge target ports and independently diagnose inherited label corridor hints. 3. Verify combined behavior and renderer tests, inspect the original board, simplify, and commit.

4. Straighten the newly reported staircase on the added connection and the removed size-cards route; verify the nearby crossings receive bridges after routing clears the card.

5. Preserve inherited label positions relative to the existing architecture while retaining the improved routes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New forward skips retain WEST exits and select NORTH entry when the predecessor target center lies left of the source exit; otherwise WEST remains. Existing connections retain their prior sides. Universal NORTH entry was rejected because it rearranged baseline diagrams. Fixed literal-colors dogleg by allocating inner flank lanes before outer label clearance: provisional inner guides previously pushed an outer guide through an adjacent card before moving away themselves. Regression red on prior code and green after. Existing flank test now permits only 0.5px numerical displacement because ELK uses ceil(labelWidth)/2 for inline port offsets (observed 0.305px), still rejecting visible 25px bends. Combined original SVG/PNG inspected: 18 routes, zero card crossings, 18 labels clear of cards and unrelated routes. Targeted routing/comparison/containment tests: 16 passed. Simplified selector after lint; no layout postprocessing or new dependencies.

Final implementation seeds WEST-to-NORTH connections on their target corridor, preserves inherited attachment offsets per face where port spacing permits, and keeps inherited labels near their source-relative positions through the existing collision-aware label allocator. Corner rounding reserves bridge clearance at proper perpendicular crossings. No waypoint postprocessing, bridge-policy change, or dependency added. Original comparison rendered and inspected at 1421x1236: all 18 routes clear cards, all 18 labels clear cards and unrelated routes; size cards aligns with route relationships, routed edges stays horizontal, and the formerly missing crossing carries a bridge on the removed route. User confirmed the result looks good. Public regressions were demonstrated failing against isolated baselines and passing with the fix. Full check passed lint, formatting, types and build; module run had 3053 passes and 5 failures. One failure was a test mistaking a newly visible bridge for an endpoint corner; corrected its bridge identification without changing radius or approach requirements, then 12 focused approach/crossing tests, lint baseline, type-check and formatting passed. The remaining four failures concern concurrent font/palette changes (rasterizer page colors, standalone theme surface tokens, data-flow label width, and inherited return-label room); the latter independently reproduces with HEAD layout in /tmp/task221-baseline. Later system/browser lanes were not reached. Canvas restarted and health confirms current source.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shortened eligible new skipped connections while retaining left exits and existing attachment choices. Preserved straight comparison corridors, inherited label rows and horizontal runs, and room for crossing bridges. Original-board render and clearance checks plus public regression tests verify the accepted result. Full validation reaches module tests with four unrelated font/palette failures remaining; all changed-scope tests and static checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
