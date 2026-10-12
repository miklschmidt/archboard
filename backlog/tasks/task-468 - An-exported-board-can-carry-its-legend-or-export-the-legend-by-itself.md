---
id: TASK-468
title: 'An exported board can carry its legend, or export the legend by itself'
status: To Do
assignee: []
created_date: '2026-10-12 00:35'
labels: []
dependencies: []
priority: medium
ordinal: 813000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An exported picture does not explain its notation, so a reader of a pull request or a document sees card kinds, relationship kinds and comparison marks without a key, and authors write the key by hand. The page already draws a legend of what the picture contains; the export should be able to carry it, and to hand it over as a separate picture that can sit beside the board in either direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An option on `semantic render` and `semantic rasterize` adds the legend to the exported picture; it lists only what that picture draws (node kinds, relationship kinds and marks), the same as the page legend
- [ ] #2 A command or option exports the legend alone as SVG and PNG in a horizontal layout and in a vertical layout
- [ ] #3 The legend follows the theme choices (light, dark and the theme-following one), is measured with the diagram fonts, and is identical in content to the page legend
- [ ] #4 Without the options, the output is byte-identical to today; the `archboard-pr` skill uses the legend option in place of the hand-written key
- [ ] #5 Test owners cover content, both orientations, both themes and the unchanged default
<!-- AC:END -->
