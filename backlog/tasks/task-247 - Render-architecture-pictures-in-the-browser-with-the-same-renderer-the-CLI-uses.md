---
id: TASK-247
title: >-
  Render architecture pictures in the browser, with the same renderer the CLI
  uses
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 19:42'
updated_date: '2026-09-17 10:03'
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
- [x] #1 An architecture picture is laid out with text widths from the canvas of the environment that draws it: the browser own canvas in the canvas, an @napi-rs/canvas OffscreenCanvas under Bun, with the diagram fonts loaded in both
- [x] #2 The renderer core has one implementation used by both; the browser and Bun differ only in transport, text canvas and worker mechanism
- [x] #3 Worker pools size themselves from the host core count in both environments
- [x] #4 Board content in the browser is a read-only cache invalidated by the server board announcements, and ADR 0023 records why that keeps one source of truth
- [x] #5 The canvas first picture of a board is measured against the server-rendered baseline and recorded
- [x] #6 Background pre-rendering: when the server announces that a board changed, the browser renders its affected variants in the background rather than waiting for someone to navigate to them
- [x] #7 Rendered pictures are cached in localStorage, keyed so a changed board, variant, view, theme or renderer version misses the cache
- [x] #8 On page load the localStorage render cache is checked for invalidation against the server board versions before any cached picture is shown
- [x] #9 The custom font measurer and the Pretext patch are deleted; no code measures text outside a canvas
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

2026-09-17: steps 1 and 2 committed on local branch task-247-browser-render (1beab551 renderer core behind a host in src/transformers/semantic-renderer, text measured through OffscreenCanvas with @napi-rs/canvas under Bun, custom measurer and Pretext patch deleted; ed2a20d8 drawingOf/predecessorDrawingsOf in src/shared/semantic-board). Full gate green. @archboard/elk-rs 0.11.0 is published; on it archboard fails 7 renderer tests (4 engine infinite loops, bendpoint and port divergences from the patched elkjs, errors rejected as plain objects, no types in exports). Fixtures captured in ~/Projects/elk-rs-smoke/archboard-fixtures; fixes are going into the fork with tests, then 0.11.1. The swap itself is parked on local branch task-245-elk-rs.

2026-09-17: rebased onto feat/semantic-boards; the user merges locally, nothing is pushed. Commits: d3fec6bb (elk-rs 0.11.1 replaces patched elkjs, every scorecard holds, layout-rules.md section 23), 5be8c81f (the canvas draws in the page; pictures kept in localStorage stamped with board version, policy fingerprint and renderer build; drawn again in the background on announcements; icons served by name from /assets/diagram-icons instead of bundling ~3,200; theme colours through a Vite module running the same lightningcss reader). Full gate green, with the new browser owner browser-drawn-pictures.test.ts: no render-route request, engine worker started, icons fetched, kept picture shown on reopen without a worker, board edit drawn again in the page.

First picture, measured 2026-09-17 against an isolated canvas on a copy of the dogfood vault. Headless Chromium, fresh browser context per board, ms from navigation start to the pane's drawn state. 'server' is the render route's first answer for the board, which does the layout on the server. 'page' is a first open with nothing kept. 'kept' is reopening in the same context.
Agent workbench server 131, page 645, kept 316
Archboard 21 / 495 / 332
Board persistence 98 / 571 / 247
Board viewer 71 / 566 / 312
Browser application 68 / 534 / 243
Canvas server 224 / 825 / 315
Codex session 68 / 568 / 301
Command dispatch 65 / 528 / 290
Command interface 29 / 481 / 289
Renderer layout 46 / 517 / 305
Semantic renderer 115 / 608 / 244
Reading: 'kept' is roughly app boot plus reads, with no layout. 'page' minus 'kept' is layout in the page: about 160 ms on the smallest board, which is worker start and WASM compile, and 330 to 510 ms on the larger ones, about twice native layout on the server. So a first view is slower than asking the server was (boot plus server time). A reopened or pre-drawn picture is faster. Open levers: start and warm the worker pool at page start, compile the WASM module once and share it across workers, code-split the renderer out of the main bundle.
Not yet proven by a test: a kept picture of an older board version is not shown after a reload. The code reads the board document before choosing a kept picture.

AC #6 left unchecked: background drawing of variants nobody is looking at is implemented (local-pictures.ts drawAhead) but no test proves it; the browser owner only proves the visible pane redraws.

2026-09-17, three first-picture levers:
- 6b27fd57: an engine starts at page start with a warm-up layout; the renderer is split into its own 119 kB chunk; the pool grows one worker at a time, only once running workers have answered (it had been starting 12-16 workers, each compiling the engine); a picture asked for again while it is being laid out waits for that layout.
- d470b8ad: elk-rs 0.11.2 compiles the engine once in the page and shares it with every worker.
First picture drawn in the page, ms (before the levers -> after): Archboard 495->333, Agent workbench 645->520, Semantic renderer 608->489, Canvas server 825->563. Reopen with a kept picture: 250-330 ms, which is app boot.
Sharing the engine, and letting the pool grow freely once it was shared, changed nothing measurable: workers now start in milliseconds.
CPU profile of the Canvas server first picture: renderer JavaScript on the main thread 145 ms; the shell's applyTheme forces a style recalculation of the 144 kB stylesheet at boot, 134 ms; the rest is waiting on reads and workers.
Next levers, not started: move the renderer core itself into a worker (Pretext can measure with OffscreenCanvas and the worker's own fonts), which frees the main thread but does not cut total time; cut the solves label settling makes (layout-rules.md section 22); skip the forced reflow in applyTheme on the first application.

2026-09-17, all first-picture levers measured:
- Kept: engine start at page load and renderer split (6b27fd57); shared compiled engine (d470b8ad); first theme without a forced style flush (c947119b); faster label placement, pictures byte-identical (156dac4d); elk-rs 0.11.3 without native thread contention (f35f8d74); reservation releases solved side by side, pictures byte-identical (3ce680a1).
- Bun timing.ts first renders summed over fourteen boards: 2569 -> 907 ms (flask-map-2 1125 -> 376, Canvas server 218 -> 77).
- Chromium, eleven vault boards over three runs: mean first picture 440 -> 396 ms, reopen 287 -> 272 ms.
- Measured and dropped: renderer in a worker (no long tasks from drawing); free pool growth (no gain); WASM SIMD and wasm-opt levels in the fork (no gain).
- Details in layout-rules.md section 24. Full gate green.

2026-09-17: the last two criteria have owners in src/ui/semantic-board-canvas/tests/local-pictures.test.ts. #6: an announced change draws the current architecture first, then every other state, in every view and theme the page has been reading, one layout at a time, and opening a proposal afterwards needs no further layout. #8: a page loading against a moved or unlisted board forgets the kept picture when the boards are listed, and a kept picture of an older version is drawn again rather than shown even before the listing arrives. Mutation check: dropping the announcement listener, running the layouts at once, making forgetStalePictures a no-op, or skipping the version stamp each fails a test. bun run lint, type-check and fmt pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The canvas draws its own pictures in the page with elk-rs WASM and measures text with the canvas of the environment that draws. Both the browser and Bun share one renderer core. Pictures are kept in localStorage, stamped with the board version, policy fingerprint and renderer build; they are checked against the server's versions on page load and drawn again in the background when the server announces a change. The first picture is measured against the server baseline and recorded above. Verified by browser-drawn-pictures.test.ts (browser lane), measured-text.test.ts, and local-pictures.test.ts for drawing ahead and page-load invalidation, which was checked by mutation.
<!-- SECTION:FINAL_SUMMARY:END -->
