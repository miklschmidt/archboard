---
id: TASK-653.16
title: >-
  The renderer hands out finished marks, and Chromium, recipes and rasters are
  packages of their own
status: Done
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-20T19:43:00Z'
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
- [x] #2 @archboard/headless-chromium (layer 2) exports launchHeadlessChromium, discoveredChromiumPath, HeadlessChromiumError and DevTools with connect, call, evaluate, on, diagnostics, readBlobTo and close (width 11); @archboard/render-recipe exports readRenderRecipe, replaceRenderRecipe, recordArchitectureRecipe and readPngDimensions (width 4); @archboard/raster exports rasterizeAll and rasterScaleSchema (width 2); INTERFACE_WIDE clears on all four
- [x] #3 rasterizeAll(jobs, { signal?, chromiumPath? }) yields captures in order, starts Chromium lazily, shares one per iteration and awaits proven shutdown on exhaustion, on failure and on early return, each tested
- [x] #4 fit(size, room?, ceiling = 1) returns a number; sample markup is finished in TypeScript (markSample over a closed union, warningMark, lineMarks, markCounts, scopedDrawingKey); startCpuPainter folds into startPainter's options; embedRecipeInPng is private behind replaceRenderRecipe and the test-only legacy recipe writer is gone; captureArchitecture stays in the CLI
- [x] #5 The raster receipt schemas are candidate 11's modelShape keys rasterReceipt and legacyRasterReceipt, and the CLI assembles source and file
- [ ] #6 measure.ts moves to scripts/ and its fixtures stay with the renderer tests
- [x] #7 Native and WASM corpus SVG hashes, rasterized PNG bytes and their recipes are identical before and after, and the site audit (site/README.md#audit-the-site) passes
- [ ] #8 No new ADR: one line in proposal sL6y1FLr records the moved jobs, and the package descriptions name each package's job
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Built on deepen/653-16-renderer (from deepen/module-depth at be3a3b3201), nine commits.

Widths (check's count, types excluded; ceilings file counts types):
- renderer 17 (browser 4, bun 3, core 2, picture 5, shell-geometry 2, theme 1), logic 1119, ceiling 56 -> 22. No INTERFACE_WIDE or MODULE_SHALLOW. Two EXPOSED_UNUSED (information): themeColors (see deviation 2) and startBrowserRenderer (pre-existing, partial read of main.tsx).
- headless-chromium 11 (launchHeadlessChromium, discoveredChromiumPath, HeadlessChromiumError, DevTools + 7 methods), layer 2, ceiling 6.
- render-recipe 4 (readRenderRecipe, replaceRenderRecipe, recordArchitectureRecipe, readPngDimensions), layer 5, ceiling 4.
- raster 2 (rasterizeAll, rasterScaleSchema), layer 6, ceiling 2.
The three new packages are bound to no vault module (vault left unchanged), so the code check does not judge them yet.

Proof: WASM corpus 0 of 1084 drawings differ; 271 paintings byte-identical; native SVGs 271 of 271 identical before and after and equal to WASM. CLI model rasterize: 8 PNGs (whole dark/light, module, scale 2, region, vertical legend, flow sequence, flowchart) byte-identical, so their recipes are too; 3 server SVG renders with recipes byte-identical; 11 receipts identical apart from the output path; check embeds unchanged; measure.ts PICTURES 6 of 6 PNGs identical. CLI contract proof (artifacts/cli-contract) byte-identical to base. Shell screenshots against a base build: full page light and dark, comparison view and parts list with standing pins, 0 differing pixels; the 8 sample kinds render the same SVG markup as the old React components. Site audit: paintings identical to base, astro check 0 errors, hero and window CPU painters and the own-model painter start, no console errors, section screenshots equal base apart from live animation; diagrams regenerated identically apart from ids the example import mints per run (not committed).

Lanes: build, types, lint:all, format:check, bun-nix pass; test:modules 5391 pass 1 skip; test:repository 196 pass; test:system 228 pass; test:solo 16 pass; test:serial-browser 50 files 73 pass. No crate changed.

Deviations awaiting advisors:
1. measure.ts stays in packages/renderer/tests/runtime/support/wide-boards/ (AC 6 not met). In scripts/ it must import the renderer's test-owned scorecard (drawn-scorecard.ts and the drawn-* helpers, ~3,400 lines that renderer tests share), which archboard/module-entrypoints (noProductTestImport) forbids. So @archboard/raster sits at layer 6, below the renderer: raster's code never needed the renderer; its tests now capture hand-written SVGs, and theme-following.test.ts (the renderer's auto SVG under each scheme) returns to the renderer's tests with png-colors and cold-start-timing.
2. ./theme keeps themeColors (renderer 17, AC 1 not met). tests/system/browser/support/theme-parity.ts (drawn-glyphs browser test) normalizes the shell's computed tokens through the same Lightning CSS converter; no other public route reaches it. Options: keep it; give the system test its own normalization (~100 lines); or compare against a standalone SVG's literals.
3. AC 8's proposal line in sL6y1FLr is not written: the brief said to leave the vault unchanged.

Other choices: rasterizeAll ends a run on the first failed capture (the old rasterizer retired the session and went on); the stop-during-startup test case went with stop(); markSample(sample, { width?, id? }) returns a whole <svg>, which the web wraps in an inline-flex shrink-0 span; warningMark takes a point or a box; startPainter(canvas, dark, { failure?, only?: "cpu" }); buildCore() is async and re-enters nix develop with bun --eval instead of exiting the process; coreSourceHash() now hashes the build module in place of scripts/build-core.ts, so the hash (CI caches, release marker) changes once; the test-only board recipe writer and the legacy board's DrawnInput fingerprint went with it.

Outside the slice: model-contract (raster-receipt.ts, two shapes keys), walkthrough (imports), scripts/release (installation()), apps/web shell/legend/camera/flow-fit callers, evals/coverage.json (owner path), site/src/scripts hero painters.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Headless Chromium, render recipes and the rasterizer are packages of their own (11, 4 and 2 names); the renderer hands out finished marks, shell(key) and fit, buildCore and coreSourceHash (17 names, down from 53). Every corpus SVG, native SVG, raster PNG, recipe and receipt is byte-identical, the shell and site look identical to base, and every lane passes. Open for the advisors: measure.ts stays with the renderer tests (raster sits below the renderer), ./theme keeps themeColors for the browser theme-parity test, and the proposal line awaits a vault writer.
<!-- SECTION:FINAL_SUMMARY:END -->
