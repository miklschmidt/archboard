---
id: TASK-346
title: A picture is drawn once and takes its theme from the page's CSS
status: To Do
assignee: []
created_date: '2026-09-24 23:08'
labels:
  - renderer
  - frontend
dependencies: []
priority: high
type: enhancement
ordinal: 587000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-25: switching theme should be CSS, not a redraw. Today the renderer resolves the page's own CSS tokens (--background, --sidebar, ...) to literal colours per theme through themeColors (lib/host.ts, lib/theme.ts) and mixes derived inks in TypeScript (lib/svg/colour.ts mixed, drawnInk, comet heads), so every board is laid out once and painted, cached, swept ahead and kept twice, once per theme, and a theme switch waits for a repaint. No ADR chose this. The picture should paint with the tokens themselves (var(--...)) and derive inks with color-mix(), so theme stops being an input to a render: one picture per board, an instant theme switch, and half the draw-ahead work. A standalone SVG or PNG (CLI render and rasterize, the server render route) carries its token values in its own stylesheet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The renderer paints every colour as a page token or a color-mix() of tokens and configured colours, and a render request no longer names a theme
- [ ] #2 Switching the page's theme recolours the picture on screen with no new render and no new query
- [ ] #3 The draw-ahead sweep and the kept pictures hold one picture per reading, not one per theme
- [ ] #4 A standalone SVG from archboard semantic render, and a rasterized PNG, look as they do today in the theme asked for
<!-- AC:END -->
