---
id: TASK-526.02
title: >-
  A board render carries its render recipe, and SVG renders follow the reader
  and show their legend
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - renderer
  - cli
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 922000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A rendered file records nothing about the board it draws, so nothing can tell later whether it is outdated or draw it again. Archboard runs from a clone, so two machines can run two renderer commits, and a comparison of picture bytes alone flaps between them. ADR 0057 decides what the recipe holds and the new defaults. The owner wants an embed to work in light and dark documentation pages without options.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An SVG render holds its render recipe in its metadata element, and a PNG render holds it in a text chunk, on stdout, with --out and on the clipboard
- [ ] #2 The recipe names the board by id and name, the variant by id or as current, the view by id, the variant drawn against, and the theme, layout, legend and title
- [ ] #3 The recipe holds a fingerprint of the drawn input and a hash of the picture without the recipe, and no output path or board version
- [ ] #4 A draft edit, a walkthrough edit or a rename leaves the fingerprint of a render of the current variant unchanged, and an edit of the drawn variant changes it
- [ ] #5 The same board and recipe give the same bytes twice
- [ ] #6 semantic render defaults to the auto theme and a horizontal legend, and --no-legend draws none
- [ ] #7 semantic rasterize defaults to the dark theme
<!-- AC:END -->
