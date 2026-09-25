---
id: TASK-348
title: 'Layout is a swappable engine behind one seam, chosen per render'
status: To Do
assignee: []
created_date: '2026-09-25 00:15'
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
- [ ] #1 A layout engine is one module behind a small interface, and today's engine is registered as one implementation with no change to any picture
- [ ] #2 archboard semantic render and rasterize take an engine choice, and the browser has a setting that redraws the open board with another engine without reloading
- [ ] #3 Layout cache, render query, kept pictures and draw-ahead carry the engine, so pictures from two engines never mix
- [ ] #4 A gallery shows every dogfood board and view side by side under each engine with its layout time
<!-- AC:END -->
