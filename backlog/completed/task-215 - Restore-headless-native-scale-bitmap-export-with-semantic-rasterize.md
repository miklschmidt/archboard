---
id: TASK-215
title: Restore headless native-scale bitmap export with semantic rasterize
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 22:47'
updated_date: '2026-09-15 19:30'
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

Review implementation against TASK-215 and reconcile the branch with reviewed TASK-212/213 fixes. Fix confirmed raster ownership, capture-evidence and visual-verification findings; run model-free regressions, visual QA and the full normal check gate in an isolated checkout. Merge into feat/semantic-boards while preserving concurrent theme and pane work. No author evals or grader runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on branch claude/task-214-215-rasterize: src/runtime/semantic-rasterizer (DevTools client, Chromium session owner, page readiness with SMIL paused at t=0 and every face loaded, PNG header check, bounds), src/cli/commands/semantic-rasterize.ts (--variant/--view/--theme/--scale/--region, binary receipt with diagram page, scale, variant, view and SVG digest; refusals RASTERIZER_UNAVAILABLE 4, RASTER_BOUNDS_EXCEEDED 2, RASTER_FAILED 1), audit entry, timing constants renamed to SEMANTIC_RASTER_*. Owners: src/runtime/semantic-rasterizer/tests/rasterizer.test.ts (11 cases, ~3 s) and tests/system/semantic-boards/rasterize.test.ts (3 cases). Docs: INSTALL.md Rendering to a bitmap, TESTING.md, docs/agents/test-suite.md, server-rendering-boundary.md status note, .gitignore. Measured: cold Chromium start plus three captures 525 ms; a 1199x712 board at scale 2 answers 2398x1424.

Validation: bun test src/runtime/semantic-rasterizer (11 pass), bun test tests/system/semantic-boards/rasterize.test.ts (3 pass, incl. --region tile and out-of-page refusal), tests/system/cli/command-contract-artifacts.test.ts (3 pass), bun run lint clean, both tsconfigs type-check, fmt:check clean, test:modules 3025 pass, test:repository 8 pass; test:system 159 pass with the 4 pre-existing resource-cleanup failures only. AC evidence: 1 system test selectors and refusals; 2 module test native and x2 sizes; 3 four faces loaded before the shot, a document whose face cannot load is refused, data-flow SVG with <animate> captured; 4 board file bytes and mtime unchanged, receipt names file, size, scale, diagram, variant, view and svgSha256; 5 empty board exit 2, unknown view nonzero and no file, no Chromium named by RASTERIZER_UNAVAILABLE, bounds refused before any browser starts, queued cancellation and provable stop; 6 owners above; 7 INSTALL.md Rendering to a bitmap, TESTING.md, skill guidance, .gitignore, harness consumes the CLI.

Independent review fixed cancellation during Chromium acquisition, socket cleanup on connection failure, whole-process-group shutdown proof using the existing identity-aware process owner, and retention of unclean startup/retirement receipts. Failed cleanup prevents PNG publication or reuse of a potentially leaking owner. TERM/KILL waits fit within the CLI shutdown allowance. Native bounds now reject dimensions rounding to zero pixels before launch. The CLI and evaluation harness use one authoritative raster receipt schema. Real architecture, sequence and comparison PNGs were visually inspected with complete labels, routes, embedded fonts and comparison marks. Focused native raster and cancellation regressions pass; no author evals or grader runs. The normal-gate part of AC7 remains unchecked because the integration target's concurrent committed styling causes eight existing renderer assertions and an OKLCH arrowhead-selector browser failure; preserved these TASK-217-owned files unchanged.

Final review validation: 116 focused tests pass across skill evaluation, rasterizer, restoration and system rasterization. All 163 system tests and 8 repository-policy tests pass; the nine remaining browser owners pass after isolating the existing semantic-status-legibility failure. Full gate reached 3031 passing module tests plus the one subsequently corrected mock-receipt regression and eight unrelated renderer assertion failures. No eval authors or grader ran.

AC 7: archboard semantic rasterize --help documents scale and capture semantics, INSTALL.md Rendering to a bitmap and the skill Verification bullet name the command, raster outputs under .skill-evals and docs/design/generated are ignored, and TASK-214 captures use src/runtime/semantic-rasterizer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Headless native-scale bitmap export restored as semantic rasterize with its own owner; documented in help, INSTALL.md and the skill; verified by the rasterizer and system owners.
<!-- SECTION:FINAL_SUMMARY:END -->
