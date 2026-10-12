---
id: TASK-466
title: An exported board SVG follows the reader's light or dark theme
status: To Do
assignee: []
created_date: '2026-10-12 00:34'
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
