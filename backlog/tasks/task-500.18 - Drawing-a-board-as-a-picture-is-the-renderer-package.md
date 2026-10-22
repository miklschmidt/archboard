---
id: TASK-500.18
title: Drawing a board as a picture is the renderer package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-22 01:43'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 887000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
renderer is layer 5: transformers/semantic-renderer (39,839 lines), runtime/semantic-renderer, semantic-rasterizer, headless-chromium, ui/browser-renderer, shared/shell-geometry and theme. The doc plans api files for the browser, the worker and Bun (browser, worker, bun). Keep working: the @napi-rs/canvas and font assets (runtime/semantic-renderer/lib/bun-host.ts), the browser measurement contract (tests/system/browser/measured-text.test.ts), the worker and WASM URLs (frontend/main.tsx) and the digest and stylesheet paths in vite.config.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/renderer holds the seven modules in role folders with browser, worker and bun api files, and the font, canvas, worker, WASM and digest paths keep working
- [x] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/renderer (layer 5) with curated api files from the start (the doc plans browser, worker and bun entry points): shared (transformers/semantic-renderer pure picture code, shell-geometry, theme), runtime (semantic-renderer bun host and layout worker, semantic-rasterizer, headless-chromium), ui (browser-renderer). The transformers area becomes shared/rules etc. (areas are shared, runtime, server, ui).
2. Assets: the fonts (src/ui/shell/assets/fonts, used by src/ui/theme/app.css, bun-host FONT_DIR, server application.ts express.static, NOTICE.md) move into the package; consumers get the path from an exported constant, no package reads a src/ path. theme.css, libavoid wasm URL and the layout worker keep working: frontend/main.tsx starts the worker and finds the wasm today with new URL(...); use the package export (Vite ?worker import or an equivalent proven by build:frontend and the browser lane). vite.config.ts RENDERER_SOURCES, docs/readme/assets.json, the measured-text browser contract (tests/system/browser/measured-text.test.ts) and ci.yml keep naming real paths.
3. Tests (211 files in runtime/semantic-renderer incl. 86 non-ts fixtures, 10 transformers tests) move with the code. bun run check including the serial browser lane.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reconciled acceptance criteria 2 and 3 with the original completion summary in 580dfc640. TASK-500 records bun run check exiting 0 at e462ec210, including all lanes and 19 browser files. Only the parent task record changed between that revision and 33f762dcd. This update corrects the task record and adds no new test result. No board is affected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/renderer (layer 5) holds the picture drawing: shared (pure picture code, shell geometry, constants), runtime (bun host and layout worker, rasterizer, headless chromium, theme, assets) and ui (browser renderer, worker) behind eight curated api subpaths (61 names; picture, shell-geometry and browser are browser-safe). Fonts and theme.css moved into the package and consumers get their paths from the ./assets constants; the built stylesheet is byte-identical (157,738 bytes) and the emitted worker and wasm files are unchanged. frontend/main.tsx reaches the renderer through @archboard/renderer/browser (there is no ./worker export: the browser api file starts its own worker). A real old import cycle (tree, walls, card-graph) was broken by moving one helper. Codex checked 4,306 import bindings, 120 test files and 86 fixtures; its one finding (the readme asset sources missed packages/renderer/assets) is fixed. bun run check passed including the measured-text browser contract.
<!-- SECTION:FINAL_SUMMARY:END -->
