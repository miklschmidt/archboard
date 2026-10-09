---
id: TASK-409
title: A muted relationship mixes background into its color and keeps its weight
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 09:59'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 767000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A muted relationship is a line the author wants to be quiet. Today it is drawn thinner (1.2 against 1.4) and in a separate muted ink. The owner wants it to be quieter by color alone: the color mixes in some of the background, and the line is never made translucent (no opacity), so two lines that share a lane draw no darker where they overlap. Its arrowhead has the same length as every other head (TASK-404).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A muted line is drawn in the color of its relationship mixed with some of the page background, in the light and the dark theme, with no opacity on the line, its arrowhead or its pulses
- [x] #2 A muted line has the same stroke width as a default line, and its arrowhead has the same length as every other head
- [x] #3 A muted line is clearly quieter than a default line and still readable, and the notes give the contrast of a muted neutral line and of a muted colored line in both themes
- [x] #4 ADR 0044 and DESIGN.md say how a muted line is drawn, and the legend row for more or less emphasis still matches the picture
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find how a muted line gets its ink and its weight (lib/svg/styles.ts STROKE_WIDTH and drawnInk, the edgeMuted role in lib/theme.ts). 2. Draw a muted line in the color of its relationship mixed with a share of the page background, and with the stroke width of a default line. Never use opacity. 3. Choose the share by looking, in both themes, for neutral and colored lines. 4. Update tests, ADR 0044, DESIGN.md and the legend, and render the review set.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A muted line was 1.2 wide against 1.4 and used the same ink as a default line (the edgeMuted role was only the lifeline's, and TASK-404 removed it). Now (commit 170e65ac3) a muted line is 1.4 wide and its ink is its default ink with the page mixed in (MUTED_STRENGTH in lib/svg/styles.ts: keeps 70 percent on the light ground, 60 percent on the dark), never opacity. Its head and its pulses take the same ink. A removed line keeps its own strength. WCAG contrast against the page (and the container floor): neutral muted light 2.40 (2.16), dark 2.44 (2.59), against default 3.86 and 4.56. Coloured muted on the light page: emerald 2.45, teal 2.43, blue 2.41, violet 2.67, pink 2.57, fuchsia 2.60, orange 2.08, sky 2.03, amber 1.69. On the dark page: sky 2.65, blue 2.41, violet 2.32, pink 2.34, emerald 2.83, amber 3.14. The legend has no muted row, and its More emphasis row still matches.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Muted relationships mix the background into their ink and retain the default width. Palette and emphasis owners pass with the shared arrowhead length. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
