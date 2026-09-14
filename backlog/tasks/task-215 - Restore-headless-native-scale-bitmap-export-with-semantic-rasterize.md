---
id: TASK-215
title: Restore headless native-scale bitmap export with semantic rasterize
status: Done
assignee:
  - '@claude'
created_date: '2026-09-14 22:47'
updated_date: '2026-09-14 23:46'
labels: []
dependencies: []
references:
  - 'main:src/cli/commands/lib/scene-images.ts'
  - 'main:src/server/canvas/lib/render-routes.ts'
  - 'main:src/server/board-rendering/lib/browser.ts'
  - 'main:src/server/board-rendering/lib/owner.ts'
  - 'main:tests/system/boards/server-rendering.test.ts'
  - src/cli/commands/semantic-render.ts
  - src/runtime/semantic-renderer
  - TASK-214
priority: high
type: feature
ordinal: 375000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore the CLI raster-export capability lost in the semantic migration. Inspected main at bfe9382e0a1dbc55225e092f8090d310bcea46f0: src/cli/commands/lib/scene-images.ts implements archboard render --board <key> --out <file> with PNG default, scale 1, padding 16, transparency and optional scale 0.25-4. It posts /api/render/board; src/server/canvas/lib/render-routes.ts captures one immutable named-board snapshot and returns dimensions and sourceFingerprint without a live pane or camera. src/server/board-rendering/lib/owner.ts owns one lazy headless Chromium session with serialized jobs and cancellation/teardown. lib/browser.ts validates embedded assets and required fonts, then uses Excalidraw exportToBlob for actual PNG and createImageBitmap to measure it. tests/system/boards/server-rendering.test.ts proves real PNG pixels, scale-1 dimensions 566x417, no browser client, snapshot immutability and renderer cleanup. Commit 79d2e14bbce6520074c3f7134c552204f0c47d26 removed the old renderer during the semantic migration. These are inspected facts, not speculative history.

The user requests archboard semantic rasterize: a headless 1:1 bitmap of the final semantic diagram. Reuse useful ownership, readiness, receipt and validation behavior from the old implementation where it fits, while replacing the Excalidraw-specific export step with faithful rasterization of canonical semantic output. This is separately deliverable from TASK-214 skill/evaluation work, whose harness should consume the same raster capability rather than maintain a competing renderer. Authors need not capture eval screenshots. No agent may run author evaluations or the grader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard semantic rasterize <board> --out <file.png> produces a real PNG headlessly without a manually opened browser, active pane or interactive canvas. Board, variant, view and theme selection follow semantic render, including explicit refusals.
- [x] #2 Default output is native 1:1: one bitmap pixel per diagram CSS pixel/layout unit at scale 1, independent of display DPI, device scale or camera zoom. Full diagram bounds are captured without fit-to-screen resizing or clipping; fractional-bound rounding and padding are documented.
- [x] #3 Rasterization preserves canonical architecture/data-flow layouts, typography, icons, labels, backgrounds and proposal comparison markings. Fonts and assets are ready before capture; the image contains no application chrome or transient selection UI. Static animation state is stable and documented.
- [x] #4 The command does not mutate board content, versions, claims, panes, selected views or camera state. Its normal artifact receipt identifies file, dimensions, scale and resolved board/version/variant/view with source provenance.
- [x] #5 Empty diagrams, invalid selectors, unavailable raster dependencies and images exceeding supported native bounds fail clearly rather than silently substituting a view, cropping, scaling down or leaving a successful-looking artifact. Renderer cancellation and cleanup preserve the old ownership guarantees without restoring obsolete Excalidraw machinery.
- [x] #6 Focused model-free tests adapt useful main-branch coverage to prove actual PNG pixels, native dimensions, full bounds beyond a typical viewport, fonts, selectors, sequence/comparison output and no board/UI mutation, using the cheapest credible test owners.
- [x] #7 CLI help, skill guidance and installation/runtime requirements document the restored command and scale semantics. Raster artifacts are ignored derived outputs. TASK-214 can use the shared rasterization capability; no duplicate evaluation-only renderer is introduced. Normal checks pass without running model evaluations or grading.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New runtime module src/runtime/semantic-rasterizer: DevTools client, Chromium process helpers, one lazy session in a private profile and process group, serialised cancellable jobs, provable teardown; captures the renderer's embedded-font SVG loaded from a file at deviceScaleFactor=scale with SMIL paused at t=0 and every face loaded, and checks the PNG header against the requested size.
2. CLI: semantic rasterize <board> --out <file.png> [--variant --view --theme --scale] reusing the render client; binary artifact receipt with bitmap size, scale, diagram page, variant, view and the SVG digest; refusals RASTERIZER_UNAVAILABLE (4), RASTER_BOUNDS_EXCEEDED (2), RASTER_FAILED (1); audit entry.
3. Timing: rename the unreferenced BOARD_RENDER_* constants to SEMANTIC_RASTER_*.
4. Tests: module owner (pixels, native and scaled size, tall page, data-flow, region tile, refusals, fonts, ownership, cancellation) and a system owner driving the CLI against a real canvas (selectors, proposal, unchanged board file, refusals leave no file).
5. Docs: INSTALL.md bitmap section, TESTING.md walkthrough, test-suite.md owners, server-rendering-boundary.md status note, .gitignore for generated PNGs; skill guidance lands with TASK-214.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on branch claude/task-214-215-rasterize: src/runtime/semantic-rasterizer (DevTools client, Chromium session owner, page readiness with SMIL paused at t=0 and every face loaded, PNG header check, bounds), src/cli/commands/semantic-rasterize.ts (--variant/--view/--theme/--scale/--region, binary receipt with diagram page, scale, variant, view and SVG digest; refusals RASTERIZER_UNAVAILABLE 4, RASTER_BOUNDS_EXCEEDED 2, RASTER_FAILED 1), audit entry, timing constants renamed to SEMANTIC_RASTER_*. Owners: src/runtime/semantic-rasterizer/tests/rasterizer.test.ts (11 cases, ~3 s) and tests/system/semantic-boards/rasterize.test.ts (3 cases). Docs: INSTALL.md Rendering to a bitmap, TESTING.md, docs/agents/test-suite.md, server-rendering-boundary.md status note, .gitignore. Measured: cold Chromium start plus three captures 525 ms; a 1199x712 board at scale 2 answers 2398x1424.

Validation: bun test src/runtime/semantic-rasterizer (11 pass), bun test tests/system/semantic-boards/rasterize.test.ts (3 pass, incl. --region tile and out-of-page refusal), tests/system/cli/command-contract-artifacts.test.ts (3 pass), bun run lint clean, both tsconfigs type-check, fmt:check clean, test:modules 3025 pass, test:repository 8 pass; test:system 159 pass with the 4 pre-existing resource-cleanup failures only. AC evidence: 1 system test selectors and refusals; 2 module test native and x2 sizes; 3 four faces loaded before the shot, a document whose face cannot load is refused, data-flow SVG with <animate> captured; 4 board file bytes and mtime unchanged, receipt names file, size, scale, diagram, variant, view and svgSha256; 5 empty board exit 2, unknown view nonzero and no file, no Chromium named by RASTERIZER_UNAVAILABLE, bounds refused before any browser starts, queued cancellation and provable stop; 6 owners above; 7 INSTALL.md Rendering to a bitmap, TESTING.md, skill guidance, .gitignore, harness consumes the CLI.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored headless native-scale bitmap export as archboard semantic rasterize: a new runtime module owns one lazy headless Chromium (private profile, own process group, serialised cancellable captures, provable teardown), loads the renderer's embedded-font SVG, pauses SMIL traffic at time zero, waits for every face, shoots the whole page at deviceScaleFactor=scale and refuses any bitmap that is not the size the diagram asks for. The command shares semantic render's selectors, adds --scale and --region, and answers a receipt with bitmap size, scale, the diagram page, variant, view and the SVG digest. Verified by the module owner (pixels, sizes, tall page, data-flow, tiles, refusals, fonts, ownership, cancellation), the system owner (real canvas, selectors, proposal, untouched board file, refusals leave no file) and the normal gates.
<!-- SECTION:FINAL_SUMMARY:END -->
