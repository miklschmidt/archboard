---
id: TASK-410
title: The front edges of slabs are lighter in the light theme
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 10:02'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 768000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner finds the bottom edges of the slabs far too strong in the light theme, and finds them right in the dark theme. In light the front edge of a card is about 0.79 in lightness against a face of 0.97, which draws a heavy bar under every card, plinth, mat and label.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Slab front edges remain distinct from their faces and the shadows below them, with the final light palette from TASK-422.
- [x] #2 The dark appearance follows the later group, front-edge and neutral choices in TASK-422 and TASK-432.
- [x] #3 No layout constant changes
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 21e058c0. Light front edges: --slab-edge and --slab-deep 0.79 to 0.87, --plinth-edge 0.78 to 0.87, --mat-edge 0.42 to 0.86, --slab-shadow alpha 0.2 to 0.15; light group shares on the edge: card 0.5 to 0.32, chip 0.45 to 0.32, nameplate 0.4 to 0.3, mat 0.8 to 0.45; neutral bar edge 0.3 to 0.18. Face to edge, light: neutral card 1.77 to 1.36, grouped card 2.1-2.5 to 1.6-1.8, plinth 1.76 to 1.30, mat 3.7-4.2 to about 2.0, chip 2.1-2.2 to about 1.6, label 1.45 to 1.26. Group colour on a card face: light 0.06 to 0.12, dark 0.12 to 0.35 of a deeper shade (secondary words 4.5:1 or more for every group colour, a standing wash included). A standing wash replaces the group tint on a marked card's face; the edge keeps the group. Dark edges unchanged. No layout constant changed. Renders: scratchpad/proposals/slabs-s/e3.

Follow-ups. d57948e9: a face tinted by a group or a standing takes a softer sheen on the light ground (white at 0.2 instead of the 0.8 sheen), so its colour no longer pools at the foot; the light group share on a card face is 0.1 (was 0.12), dark unchanged. Effective light group tint, top to foot: before about 0.02 to 0.12, now about 0.08 to 0.10. da5282e1: a group's caption tab is drawn from one outline in all its layers, shadow included (castShadow): the top corner on the mat's wall and the corner across from it rounded, the other two square; mirrored for a tab in the right corner. Renders: scratchpad/proposals/slabs-s/g1 and t1.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 1: In the light theme the front edge of a card, a plinth, a mat, a chip and a label is clearly quieter, and it still reads as a thickness
Original criterion 2: The dark theme looks as it does now

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The final palette keeps the front edge distinct from the card face. Later accepted palette tasks replace the intermediate colors. Palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
