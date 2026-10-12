---
id: TASK-466
title: An exported board SVG follows the reader's light or dark theme
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-12 00:34'
updated_date: '2026-10-12 00:46'
labels: []
dependencies: []
priority: medium
ordinal: 811000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board SVG is drawn for one ground (`--theme light|dark`), so a pull request description, a README or a document needs two files and a `<picture>` wrapper to look right in both themes. One SVG that follows the reader's `prefers-color-scheme` removes the second file, the wrapper and the two-pass posting for every consumer of the export, including the `archboard-pr` skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new theme choice on `semantic render` (and the rasterize path where it applies) draws one SVG whose colours follow the reader's colour scheme when it is shown as an image, a CSS background or inline
- [ ] #2 Opened in a browser under a light and under a dark colour scheme, the same file shows the light and the dark ground, with every card, relationship, mark and text legible in both
- [ ] #3 The explicit `light` and `dark` choices draw exactly the bytes they draw today
- [ ] #4 A test owner proves both schemes from the one file; the README or skill text that tells a reader to export two files is updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One theme-following value, auto, beside light and dark: StandaloneThemeSchema in src/shared/semantic-board/lib/rendering.ts. The renderer request, renderBoard choices, the render route and the board client accept it. DiagramTheme (the two grounds) stays for bitmaps, recordings and the host's colour table.
2. svgDocument (lib/svg/document.ts, standingAlone): auto declares color-scheme:light dark on the root and each named token as light-dark(<light>, <dark>), or the value itself where both themes agree. The picture's own light-dark() choices already follow color-scheme, so one mechanism follows the reader's scheme as an img, a CSS background and inline. Probed in Chromium 153 before coding: all three placements follow prefers-color-scheme, relative oklch(from var(--x)) colours included.
3. CLI: semantic render --theme auto. semantic rasterize keeps light|dark: a PNG holds one ground.
4. Tests: src/runtime/semantic-renderer/tests/theme.test.ts (auto declares each token as light-dark of the two themes' values); a Chromium owner in src/runtime/semantic-rasterizer/tests that shows one auto file as image, background and inline under each prefers-color-scheme and finds that scheme's ground and card edges.
5. Byte identity: hash every board x variant x view x engine x theme x comparison of the dogfood vault through the render route before and after.
6. Docs: archboard-pr renders.md, posting.md, SKILL.md (one file, no picture-pairing pass), archboard skill and INSTALL.md where they name the themes.
Boards: none affected. A third value of an existing choice inside SVG document; no part is added, removed, renamed or rewired.
<!-- SECTION:PLAN:END -->
