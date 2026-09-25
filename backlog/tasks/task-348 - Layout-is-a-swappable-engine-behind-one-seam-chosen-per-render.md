---
id: TASK-348
title: 'Layout is a swappable engine behind one seam, chosen per render'
status: Done
assignee: []
created_date: '2026-09-25 00:15'
updated_date: '2026-09-25 03:22'
labels:
  - renderer
  - frontend
dependencies: []
priority: high
type: feature
ordinal: 589000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-09-25: the renderer must be a deep module that can be swapped, with new renderers built in parallel and switched between. The seam exists: layoutCompound(content, measured, standings) returns the PaintedDrawing that the SVG painter and the atlas consume (src/transformers/semantic-renderer/index.ts layoutRemembered). Make that a named engine interface with a registry, keep today's Graphviz and libavoid engine as one implementation, and let a render name its engine: a CLI flag on semantic render and rasterize, and a browser setting that switches the open board between engines at once. The layout cache, render query key, kept-picture key and draw-ahead sweep carry the engine so pictures from both coexist. A gallery script renders every board and view under each engine with its layout time for side-by-side review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A layout engine is one module behind a small interface, and today's engine is registered as one implementation with no change to any picture
- [x] #2 archboard semantic render and rasterize take an engine choice, and the browser has a setting that redraws the open board with another engine without reloading
- [x] #3 Layout cache, render query, kept pictures and draw-ahead carry the engine, so pictures from two engines never mix
- [x] #4 A gallery shows every dogfood board and view side by side under each engine with its layout time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification 2026-09-25 on main 3d080f90: bun run check passed (every lane, exit 0). Scratch server on 3350 over a copy of the dogfood vault: semantic render 'Archboard server' --layout graphviz, then blocks, then graphviz gave d3277ec4, 1d1d4f0e, d3277ec4 (the two engines never mix in the server's layout cache); rasterize --layout blocks wrote a 2358x2887 PNG; --layout nope exits with the choice list. Headless Chromium on the open board: the engine select switched blocks, track, graphviz in place, each drawing a different picture (viewBox 2358x2887, 4823x3124, 3393x2413), and a page marker survived every switch, so nothing reloaded. scripts/engine-gallery.ts over .archboard/vault drew all 49 drawings under each engine with layout time: graphviz median 51 ms, max 7605 ms; track median 6 ms, max 79 ms; blocks median 12 ms, max 190 ms.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Layout is one engine behind layoutEngine() in src/transformers/semantic-renderer/lib/layout/engines.ts, with graphviz (unchanged), track and blocks registered. semantic render and rasterize take --layout; the browser's engine select redraws every pane in place; the server layout cache, the render query, kept pictures and draw-ahead all key on the engine. scripts/engine-gallery.ts draws every dogfood board and view under each engine with its time. Verified by the full gate, a scratch-server render round trip, a headless-browser switch and a gallery run (see notes).
<!-- SECTION:FINAL_SUMMARY:END -->
