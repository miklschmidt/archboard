---
id: TASK-196
title: Keep proposal placement recognizable from its predecessor
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 10:25'
updated_date: '2026-09-13 10:49'
labels: []
dependencies: []
ordinal: 355000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Independently laying out variants makes readers relearn the architecture instead of seeing the proposed change. Use the direct predecessor in the same board view as placement context while keeping automatic layout and room for additions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Proposal placement derives from its direct predecessor in the same view, including nested proposals and removed subjects.
- [x] #2 Existing card order and placement remain recognizable while additions and changed sizes receive collision-free space and valid routes.
- [x] #3 Switching variants in one view preserves the reader camera; other views and explicit Fit remain usable.
- [x] #4 Real dogfood boards pass visual comparison and the complete check gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Probe engine incremental constraints and inspect ancestry/scoping. 2. Thread same-view predecessor context into measured layout and preserve stable placement with engine-owned routing. 3. Preserve camera across variant changes. 4. Verify behavior, real-browser comparisons, simplify, and run the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Server now supplies actual same-view ancestor drawings, including each predecessor comparison; direct, nested and scoped-removal tests pass. Viewer camera persists across uncached variant requests, confirmed manually with identical transform before/after. Initial interactive placement retains existing columns, but live QA found label-dummy routing detours; resolving in engine constraints before acceptance.

Converged on interactive predecessor positions with semi-interactive crossing minimization. Narrow pinned ELK fixes preserve label dummy positions and apply its existing long-edge position calculation. Real Renderer layout retains all five original columns, driver position, and moves the other old cards together by 76 px; compound insertion probes regain clear routes. No custom post-layout repairs.

Final browser QA at the supported desktop size confirms recognizable predecessor columns in Renderer layout and Renderer integration, direct new measurement-chain routes, and usable preserved camera plus explicit Fit. All 28 saved readings rechecked: 25 drawings preserve node/edge/region identities, three expected empty readings remain empty, and 11 baseline drawings are byte-identical. Full gate was externally terminated during modules after lint/format/types/build passed; isolated rerun pending.

Complete isolated bun run check exited 0: 2812 module tests, 154 system tests, eight repository checks, every serial browser owner, lint, formatting, types and frontend build. Final simplification retains one engine-owned drawing and pure painter; no stored coordinates, additional UI mode or post-layout route repair. Baseline server remains untouched; new server and shared-scale comparison remain available.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented direct-predecessor placement for architecture variants with exact no-op geometry reuse, preserved dimensions and endpoint faces, measured label/long-edge hints, and camera continuity across uncached switches. Patched the pinned ELK worker to retain interactive positions. Verified real Renderer layout and Renderer integration in browsers, all saved comparison identities and unchanged baselines, focused geometry/routing/lineage/camera regressions, and the complete check gate.
<!-- SECTION:FINAL_SUMMARY:END -->
