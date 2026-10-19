---
id: TASK-500.18
title: Drawing a board as a picture is the renderer package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-19 12:09'
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
- [ ] #1 packages/renderer holds the seven modules in role folders with browser, worker and bun api files, and the font, canvas, worker, WASM and digest paths keep working
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/renderer (layer 5) with curated api files from the start (the doc plans browser, worker and bun entry points): shared (transformers/semantic-renderer pure picture code, shell-geometry, theme), runtime (semantic-renderer bun host and layout worker, semantic-rasterizer, headless-chromium), ui (browser-renderer). The transformers area becomes shared/rules etc. (areas are shared, runtime, server, ui).
2. Assets: the fonts (src/ui/shell/assets/fonts, used by src/ui/theme/app.css, bun-host FONT_DIR, server application.ts express.static, NOTICE.md) move into the package; consumers get the path from an exported constant, no package reads a src/ path. theme.css, libavoid wasm URL and the layout worker keep working: frontend/main.tsx starts the worker and finds the wasm today with new URL(...); use the package export (Vite ?worker import or an equivalent proven by build:frontend and the browser lane). vite.config.ts RENDERER_SOURCES, docs/readme/assets.json, the measured-text browser contract (tests/system/browser/measured-text.test.ts) and ci.yml keep naming real paths.
3. Tests (211 files in runtime/semantic-renderer incl. 86 non-ts fixtures, 10 transformers tests) move with the code. bun run check including the serial browser lane.
<!-- SECTION:PLAN:END -->
