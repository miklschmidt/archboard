---
id: TASK-215
title: Restore headless native-scale bitmap export with semantic rasterize
status: To Do
assignee: []
created_date: '2026-09-14 22:47'
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
- [ ] #1 archboard semantic rasterize <board> --out <file.png> produces a real PNG headlessly without a manually opened browser, active pane or interactive canvas. Board, variant, view and theme selection follow semantic render, including explicit refusals.
- [ ] #2 Default output is native 1:1: one bitmap pixel per diagram CSS pixel/layout unit at scale 1, independent of display DPI, device scale or camera zoom. Full diagram bounds are captured without fit-to-screen resizing or clipping; fractional-bound rounding and padding are documented.
- [ ] #3 Rasterization preserves canonical architecture/data-flow layouts, typography, icons, labels, backgrounds and proposal comparison markings. Fonts and assets are ready before capture; the image contains no application chrome or transient selection UI. Static animation state is stable and documented.
- [ ] #4 The command does not mutate board content, versions, claims, panes, selected views or camera state. Its normal artifact receipt identifies file, dimensions, scale and resolved board/version/variant/view with source provenance.
- [ ] #5 Empty diagrams, invalid selectors, unavailable raster dependencies and images exceeding supported native bounds fail clearly rather than silently substituting a view, cropping, scaling down or leaving a successful-looking artifact. Renderer cancellation and cleanup preserve the old ownership guarantees without restoring obsolete Excalidraw machinery.
- [ ] #6 Focused model-free tests adapt useful main-branch coverage to prove actual PNG pixels, native dimensions, full bounds beyond a typical viewport, fonts, selectors, sequence/comparison output and no board/UI mutation, using the cheapest credible test owners.
- [ ] #7 CLI help, skill guidance and installation/runtime requirements document the restored command and scale semantics. Raster artifacts are ignored derived outputs. TASK-214 can use the shared rasterization capability; no duplicate evaluation-only renderer is introduced. Normal checks pass without running model evaluations or grading.
<!-- AC:END -->
