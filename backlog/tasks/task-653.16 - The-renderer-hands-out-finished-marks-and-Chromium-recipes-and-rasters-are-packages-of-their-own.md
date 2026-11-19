---
id: TASK-653.16
title: >-
  The renderer hands out finished marks, and Chromium, recipes and rasters are
  packages of their own
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.18
  - TASK-653.15
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 13 of the archboard-deepen run. packages/renderer is wide (51 names, honestly 53): it hands out paint constants, DevTools, render recipes and the rasterizer beside the browser canvas and process-side rendering, whose callers are disjoint. The renderer keeps both hosts and hands out finished marks; headless Chromium, render recipes and the rasterizer become their own packages. The settled design, every decision and its reason: the "Candidate 13, renderer: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-13-renderer.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: renderer (packages/renderer), the new @archboard/headless-chromium, @archboard/render-recipe and @archboard/raster packages, candidate 11's contract (raster receipt keys), and the callers in apps/web, apps/server (flow-routes.ts), apps/cli (rasterize, captureArchitecture), packages/skills, packages/walkthrough, scripts (readme-assets, measure.ts) and site.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on renderer, headless-chromium, render-recipe and raster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @archboard/renderer has width 16 (browser 4, bun 3, core 2, picture 5, shell-geometry 2), keeps both hosts, marks, geometry and the core build, and keeps candidate 3's wasm contract; shell(key) is its one keyed getter with the keys navigator, sidebar, chrome, agentPanel, fitMargin, viewport and referencePane
- [ ] #2 @archboard/headless-chromium (layer 2) exports launchHeadlessChromium, discoveredChromiumPath, HeadlessChromiumError and DevTools with connect, call, evaluate, on, diagnostics, readBlobTo and close (width 11); @archboard/render-recipe exports readRenderRecipe, replaceRenderRecipe, recordArchitectureRecipe and readPngDimensions (width 4); @archboard/raster exports rasterizeAll and rasterScaleSchema (width 2); INTERFACE_WIDE clears on all four
- [ ] #3 rasterizeAll(jobs, { signal?, chromiumPath? }) yields captures in order, starts Chromium lazily, shares one per iteration and awaits proven shutdown on exhaustion, on failure and on early return, each tested
- [ ] #4 fit(size, room?, ceiling = 1) returns a number; sample markup is finished in TypeScript (markSample over a closed union, warningMark, lineMarks, markCounts, scopedDrawingKey); startCpuPainter folds into startPainter's options; embedRecipeInPng is private behind replaceRenderRecipe and the test-only legacy recipe writer is gone; captureArchitecture stays in the CLI
- [ ] #5 The raster receipt schemas are candidate 11's modelShape keys rasterReceipt and legacyRasterReceipt, and the CLI assembles source and file
- [ ] #6 measure.ts moves to scripts/ and its fixtures stay with the renderer tests
- [ ] #7 Native and WASM corpus SVG hashes, rasterized PNG bytes and their recipes are identical before and after, and the site audit (site/README.md#audit-the-site) passes
- [ ] #8 No new ADR: one line in proposal sL6y1FLr records the moved jobs, and the package descriptions name each package's job
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
