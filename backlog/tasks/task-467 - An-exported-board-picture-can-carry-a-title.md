---
id: TASK-467
title: An exported board picture can carry a title
status: To Do
assignee: []
created_date: '2026-10-12 00:35'
labels: []
dependencies: []
priority: medium
ordinal: 812000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An exported SVG or PNG is only the picture. A reader who meets it in a pull request or a document has no name for what it shows, which view, or which variant, so every author writes the caption by hand. A title drawn into the export names it once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An option on `semantic render` and `semantic rasterize` draws a title above the picture; the text is given by the caller, or defaults to the board, view and variant names when asked for
- [ ] #2 The title is measured with the diagram fonts, follows the theme (light, dark and the theme-following choice), and never overlaps or shifts the board's drawing
- [ ] #3 Without the option, the output is byte-identical to today
- [ ] #4 A test owner covers the title in SVG and PNG; the `archboard-pr` skill uses it in place of the hand-written title line
<!-- AC:END -->
