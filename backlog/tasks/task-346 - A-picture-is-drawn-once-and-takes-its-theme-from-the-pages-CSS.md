---
id: TASK-346
title: A picture is drawn once and takes its theme from the page's CSS
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 23:08'
updated_date: '2026-09-25 00:41'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Renderer paints CSS expressions: PALETTE of var(--token) (lib/theme.ts), semanticInk -> var(--semantic-*), mixed() -> color-mix(in srgb, ...) (lib/svg/colour.ts), the per-ground picks (warning token, comet glow strength) -> light-dark(). Paint properties (fill, stroke, stop-color) are serialised into the style attribute in lib/svg/primitives.ts so CSS resolves them in every consumer.
2. Theme becomes optional on DiagramRenderRequest/BoardRenderChoices: absent = a page picture that inherits the page's tokens and color-scheme; present = a standalone document whose root carries color-scheme and the values of every token it references for that theme (host themeColors, Bun only). Reply drops its theme field.
3. Server render route: theme absent draws the page picture (the page's server fallback asks without one); CLI render/rasterize keep --theme and always send it.
4. Browser: SemanticRenderRequest, render query key, picture-cache key, local-pictures sweep, drawBoardHere and picture transitions lose theme; browser host no longer carries theme colours (vite virtual module and scripts/print-theme-colors.ts go). Legend reuses the renderer's line-ink expression.
5. Tests: renderer colour owners resolve expressions per theme through a palette helper; theme owner asserts the standalone token block; browser owner proves a theme switch recolours with no new render; headless Chromium proves fills, strokes, gradient stops and SMIL-animated layers resolve.
6. Verify: rasterize every dogfood board and view in both themes on main and branch, magick compare -metric AE; run gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- Paint goes into each element's style attribute, written once in lib/svg/primitives.ts (fill, stroke, stop-color), at the position the first paint attribute stood, so every consumer resolves var()/color-mix()/light-dark() through CSS.
- The two per-ground choices the old palette made in TypeScript are light-dark(): the warning badge (warning-foreground on light, warning on dark) and the comet glow (its alpha, now color-mix(in srgb, C p%, transparent) instead of stroke-opacity). light-dark() follows the page's color-scheme, which app.css already sets from data-theme.
- A standalone document (theme given: CLI render, rasterize, server route with ?theme) carries color-scheme and that theme's value of every token it names on the root svg's style attribute, not in its <style>: a stylesheet rule inside an inlined SVG applies to the whole page, and :root would clobber the page's tokens. Only referenced tokens are declared.
- The server render route: theme absent now draws the page's picture (no token values); the page's server fallback asks without a theme. The CLI always sends one (default light). The render reply no longer carries theme.
- Marker and comet-gradient ids are derived from the colour expression through an injective escape (colourId), since expressions are not hex.
- Browser host carries no theme colours; the vite virtual module drops themeColors and theme.css from the renderer build digest; scripts/print-theme-colors.ts deleted.
Pixel comparison (98 PNGs: 15 boards whole + views, both themes, main 7b0b2af6 vs branch): 45 identical; 53 differ by at most 2/255 in one channel, 51 to 1824 pixels. With the traffic layer hidden, all 10 compared rasters (5 worst boards x 2 themes) are identical: every difference is in comet layers, from CSS resolving nested color-mix() without the old per-step 8-bit rounding (tails) and glow alpha now carried as colour alpha rather than stroke-opacity.
<!-- SECTION:NOTES:END -->
