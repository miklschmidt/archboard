---
id: TASK-612
title: Each line type in the legend is its own visibility switch
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T22:50:00Z'
updated_date: '2026-11-08T23:11:00Z'
labels:
  - frontend
  - design
dependencies: []
ordinal: 1065000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner pressed Filter in the Relationships part of the right panel legend and asked why Call and Data could not be filtered. Each eye switch stood at the right end of its grid cell, so the eye of Call sat beside the HTTP arrow and read as part of HTTP, and Call and Data looked as if they had no switch. The line marks More emphasis and Illustrated traffic stood in the same grid as the line types, but a reader can never hide a mark. The owner asked for a redesign of the filtering UI. The legend lives in apps/web/src/ui/architecture-drawing/model-reader/reading/components/ModelLegend.tsx, and the site mirrors it in site/src/components/window/PanelLegend.astro.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each control that hides a line type is visibly part of that line type's row, and no control stands next to the mark of another line type
- [x] #2 Without a click, a reader sees which line types can be hidden and which are hidden now
- [x] #3 Line marks and the mixed line, which cannot be hidden, stand apart from the line types that can
- [x] #4 Each control works from the keyboard, shows a focus ring, has an accessible name and a checked state, and meets the WCAG 2.2 target size minimum
- [x] #5 Hiding or showing a line type moves no word or mark of the legend
- [x] #6 Show all brings every hidden line type back in one step, and hidden kinds keep their URL and history behavior
- [x] #7 DESIGN.md, the docs that name the filter and the site mock describe the new design, and the site audit passes
- [x] #8 The browser tests that drive the filter test the new controls by behavior and pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build candidate layouts behind a temporary switch in ModelLegend: (A) one line type to a row, the row a switch with an eye at its end; (B) the two columns kept, each cell a plated switch; (C) the two columns kept, the eye before the sample. Marks and the mixed line move to their own two-column list under the types in every candidate.
2. Screenshot all three on Checkout API of examples/web-shop in both themes with Call hidden, and choose one.
3. Remove the Filter mode, its key, its count and the temporary switch. Keep Show all in the Relationships label row while a type is hidden.
4. Update the browser owners that drove Filter (legend, filters, surface) by behavior, and run them with reader-context and canonical-model-selection.
5. Update DESIGN.md, docs/agents/frontend.md, docs/design/operator-canvas-shell.md, the archboard skill reference and the site mock, and audit the site.
6. Run lint:all, type-check and format:check, then simplify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compared three candidates on Checkout API of examples/web-shop, in both themes, with Call hidden. A: one line type to a row, the whole row a switch of the panel row style, the eye at its end. B: two columns, each cell a plated switch. C: two columns, the eye before the sample. B made the legend heavy, read like a row of keys beside the group tags, and moved the samples off the column of the kind chips. C pushed the samples 32px right of the kind chips and made the eye read as the icon of the type. A ties each eye to its own row with nothing else on that line, uses the row tone and focus ring that every panel row has, and needs no mode. Chose A.

The Filter mode, its pressed key and its hidden count are gone: a switch that appears only on request read as missing. Show all stays in the Relationships label row while a type of the reading is hidden. A mixed line and the line marks moved to a two-column list under the types, 4px apart, with no switch.

Sequence readings show no line types and a flowchart shows only Next, which no reader can hide, so the switches appear only in architecture readings, as before.

Headless Chromium reports no hover, so hover screenshots apply the same rule through an injected style.

Evidence on 9bf8b9cb0 and 5c36290fc. lint:all, type-check and format:check exit 0. Browser owners pass, 1 of 1 each: canonical-model-legend, canonical-model-filters, canonical-model-surface, reader-context, canonical-model-selection. The legend owner checks one switch per line type with its name and checked state, the mixed line and both marks in their own list with no switch, a hide from the pointer and one from the keyboard (Space), the position of every word and mark at rest, after two hides and after Show all, and the URL after Show all. The filters owner keeps history and reload of hideKindsA.

A switch row measured 344 by 28 px, above the 24 px target minimum. Keyboard focus shows the inset ring of a panel row in both themes.

Sweep of this repository's model at 1920 by 1080, 107 readings: the whole legend is on screen on every one. The tallest is the root, 578 px with 7 line types. One line type to a row costs one more row for every two types than the old two columns, at most 88 px here.

Site audit on port 4399: the window mock now shows HTTP and Data with eyes and Illustrated traffic apart, as the root reading of the app does. Every section renders. The window, drill-down, proposal switch, claim release, walkthrough and talk demos play with no page error. render redrew place-order-flowchart and place-order-sequence with only new sample IDs, so they were restored. astro check reports 0 errors after the filter icon was removed.

No architecture proposal: the change is presentation inside the legend, and no module, relationship or flow of .archboard/vault names the Filter key.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each line type in the legend of the right panel is now a row of its own, and the row is the switch that hides or shows its lines, with an eye at its end. The Filter mode, its key and its hidden count are gone, so no control needs a mode to appear. A mixed line and the marks More emphasis and Illustrated traffic stand under the types in two columns with no switch. Show all stays in the Relationships row while a type is hidden. Hidden kinds keep their URL, history and reload behavior.

Three candidates were compared in screenshots in both themes; the plated two-column cells and the leading eye were rejected. DESIGN.md, docs/agents/frontend.md, docs/design/operator-canvas-shell.md, the archboard skill reference and the site mock describe the new design. Lint, types, format and five browser owners pass.

Cost: the line types take one column, so a reading with n types takes about n/2 rows more. The root of this repository's model, with 7 types, has the tallest legend at 578 px, and it still fits on screen. The owner has not seen it yet.
<!-- SECTION:FINAL_SUMMARY:END -->
