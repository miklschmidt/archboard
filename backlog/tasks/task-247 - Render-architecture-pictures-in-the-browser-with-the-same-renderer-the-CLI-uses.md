---
id: TASK-247
title: >-
  Render architecture pictures in the browser, with the same renderer the CLI
  uses
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-16 19:42'
updated_date: '2026-09-16 23:38'
labels:
  - renderer
  - frontend
  - performance
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - src/runtime/semantic-renderer/lib/layout/engine-pool.ts
  - src/server/canvas/lib/semantic-board-routes.ts
ordinal: 434000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The canvas asks the server for every picture (/api/semantic-boards/render), and the server lays it out in Bun workers. A first render settles several candidate drawings (readings, flank rules, label reservations), and on 2026-09-16 that took up to a second on the server (TASK-245.09). The user wants pictures drawn in the browser, where the candidates can solve in parallel Web Workers, while Bun rendering stays for the CLI, rasterizing and other programmatic uses. The same renderer code must run in both places; only the transport (render route versus in-page call) and the worker mechanism (Bun Worker versus Web Worker) differ. Worker counts are detected from the host (navigator.hardwareConcurrency in the browser, os.availableParallelism under Bun), never fixed for one machine; macOS and Linux are both supported. ADR 0023 keeps the board file the single source of truth; the user clarified on 2026-09-16 that drawing in the browser does not break that when the browser holds a variant content as a read-only cache, invalidated when the server announces a board change, the same way the drawing query is invalidated today. Record that reading as an amendment or note to ADR 0023.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An architecture picture is laid out with text widths from the canvas of the environment that draws it: the browser own canvas in the canvas, an @napi-rs/canvas OffscreenCanvas under Bun, with the diagram fonts loaded in both
- [ ] #2 The renderer core has one implementation used by both; the browser and Bun differ only in transport, text canvas and worker mechanism
- [ ] #3 Worker pools size themselves from the host core count in both environments
- [ ] #4 Board content in the browser is a read-only cache invalidated by the server board announcements, and ADR 0023 records why that keeps one source of truth
- [ ] #5 The canvas first picture of a board is measured against the server-rendered baseline and recorded
- [ ] #6 Background pre-rendering: when the server announces that a board changed, the browser renders its affected variants in the background rather than waiting for someone to navigate to them
- [ ] #7 Rendered pictures are cached in localStorage, keyed so a changed board, variant, view, theme or renderer version misses the cache
- [ ] #8 On page load the localStorage render cache is checked for invalidation against the server board versions before any cached picture is shown
- [ ] #9 The custom font measurer and the Pretext patch are deleted; no code measures text outside a canvas
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the renderer core (src/runtime/semantic-renderer and the font parsing and text measurement it uses from src/runtime/engine) into src/transformers, the area both ui and runtime may import; the layout engine and font bytes become ports; Buffer becomes DataView, node:crypto a small synchronous hash, and the theme CSS read no longer uses fs. runtime keeps Bun adapters (fs fonts, Bun worker pool) so the CLI, rasterizer and render route are unchanged. Same drawings, gate green.
2. Move drawingOf and predecessorDrawingsOf (pure) from src/server to src/shared/semantic-board.
3. Browser engine: a Web Worker pool of elk-rs WASM sized from navigator.hardwareConcurrency, written against the @archboard/elk-rs API; wiring the package waits on its publication (the user: the browser uses elk-rs, never elkjs).
4. The canvas renders locally from the board document query and the vault policy; the server route stays for the CLI.
5. Board versions in the board list; a localStorage picture cache keyed by board, variant, view, theme, board version and renderer version, checked against the list on page load; background pre-rendering of a board's variants when it is announced changed.
6. ADR 0023 amendment and the comments that cite it; a test that the browser and Bun environments draw identical pictures; timing of the canvas first picture against the server baseline.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User asked on 2026-09-16 to include background pre-rendering: render diagrams in the background when they change, cache them in localStorage, and check that cache for invalidation on page load.

Decision by the user on 2026-09-17: text is measured by the canvas of the environment that renders, never by a custom font measurer. In the browser, Pretext uses the browser's own canvas after the diagram fonts are loaded, so a picture measured in Safari, Firefox or Chrome matches what that browser paints, and pictures may differ between browsers by design. Under Bun (CLI, rasterizer, server route), Pretext uses an OffscreenCanvas backed by @napi-rs/canvas with the same four font files registered under the same family names. The custom measurer (font-file, font-layout, measure-text) is deleted, and the Pretext patch with it. Spike 2026-09-17: @napi-rs/canvas registers all four faces under Bun, measures 20,000 strings in 180 ms.
<!-- SECTION:NOTES:END -->
