---
id: TASK-500.18
title: Drawing a board as a picture is the renderer package
status: To Do
assignee: []
created_date: '2026-10-19 11:09'
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
