---
id: TASK-466
title: An exported board SVG follows the reader's light or dark theme
status: Done
assignee:
  - '@claude'
created_date: '2026-10-12 00:34'
updated_date: '2026-10-12 02:18'
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
- [x] #1 A new theme choice on `semantic render` (and the rasterize path where it applies) draws one SVG whose colours follow the reader's colour scheme when it is shown as an image, a CSS background or inline
- [x] #2 Opened in a browser under a light and under a dark colour scheme, the same file shows the light and the dark ground, with every card, relationship, mark and text legible in both
- [x] #3 The explicit `light` and `dark` choices draw exactly the bytes they draw today
- [x] #4 A test owner proves both schemes from the one file; the README or skill text that tells a reader to export two files is updated
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (smallest product): auto is a third value of the existing --theme on semantic render, not a new flag. semantic rasterize keeps light and dark, because a PNG holds one ground. The root style declares color-scheme: light dark and each token the picture names as light-dark(<light>, <dark>), or the plain value where both themes agree; the picture's own light-dark() choices already follow color-scheme, so one mechanism serves img, CSS background and inline (probed in Chromium 153 before coding).

Found on the way: the existing light/dark test in src/runtime/semantic-renderer/tests/theme.test.ts was vacuous, because the root style it declares matched the own-property regex and so no token was checked. It now reads the tokens from the document body and asserts that there are some.

archboard-pr: one auto file per render, posted as a Markdown image with alt text in one pass; the light/dark pair, the <picture> wrapper and the second posting pass are gone (renders.md, posting.md, SKILL.md). README, INSTALL.md, the archboard skill reference, evals/coverage.json and docs/design/cli-command-audit.json name the choice.

Looked at: one auto SVG with a title and a horizontal legend, shown as img, background and inline, screenshotted under prefers-color-scheme light and dark in headless Chromium; every card, line, mark and word legible on both grounds. src/runtime/semantic-rasterizer/tests/theme-following.test.ts owns it.

Boards: none affected (a third value of a choice inside SVG document).

Byte identity: a scratchpad script hashed every render of a copy of the dogfood vault through the render route (17 boards; every variant x the whole variant and each view x Track and Blocks x light and dark x comparison on and off, embedded faces): 6792 answers, 6140 SVGs and 652 NOTHING_TO_RENDER. One server ran bd8076b19, started before any edit; one ran the final code. The two sorted hash files are identical (cmp).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic render --theme auto draws one SVG that declares color-scheme: light dark and each token as light-dark() of its two values, so the one file shows the reader's ground as an image, a CSS background or inline (src/runtime/semantic-rasterizer/tests/theme-following.test.ts, headless Chromium under both prefers-color-scheme values; looked at in light and dark). light and dark draw the same bytes as before: 6792 render answers over every board, variant, view, engine, theme and comparison of the dogfood vault hash identically before and after. semantic rasterize keeps light and dark (a PNG holds one ground). archboard-pr draws one auto file per render and posts it as a Markdown image in one pass. Gate: bun run check passed on Bun 1.4.3 (modules 4522, system 198, repository 27, browser lane 19 files). Commit f1895f0fe.
<!-- SECTION:FINAL_SUMMARY:END -->
