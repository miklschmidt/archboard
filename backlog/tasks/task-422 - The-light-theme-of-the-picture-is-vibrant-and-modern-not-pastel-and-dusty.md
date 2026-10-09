---
id: TASK-422
title: 'The light theme of the picture is vibrant and modern, not pastel and dusty'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 12:48'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
  - DESIGN.md
ordinal: 778000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner finds the colors of the picture in the light theme absolutely atrocious: dusty, pastel, like the nineties. The owner guesses that the WCAG AA contrast rules are the cause and wants the light theme to be much more vibrant and modern, avoiding the pastel and dusty look at all cost. The dark theme looks good and stays. The causes to check: tints that are mixed toward warm grey and lose their chroma, trays, cards and nameplates in near-neutral beige and grey, and group and kind colors that are thin washes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The light theme of cards, trays, nameplates, chips, group tints, kind tints and frames uses clean, crisp surfaces and vivid, saturated colors, and the owner sees it on the Web shop, its proposal, Agent workbench and Archboard server and keeps it
- [x] #2 Picture text and meaningful marks meet the APCA levels from TASK-432 through crisp surfaces and strong ink. The notes record the measurements.
- [x] #3 The layout remains unchanged, and the dark theme follows the later front-edge and warm-neutral choices in TASK-432.
- [x] #4 ADR 0044 and DESIGN.md describe the light palette of the picture, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Light palette of the picture (commits 19eedc1ef, 755fc82de, b206b1e59). The dark theme keeps its values: every dark recipe resolves to the same colour as at d9a9220c8. Only yellow differs in dark, and TASK-419 changed it.

Cause: WCAG AA was not the cause. Every tint was an sRGB mix toward a warm grey or beige surface. So it lost its chroma, and its hue drifted (a blue tray floor had chroma 0.005 at hue 248, a cyan one hue 174). The neutrals were warm (beige floors, warm grey edges, a brown shadow, warm grey words). The glyphs mixed 30 % of near-black into the colour (mustard for amber and yellow). Orange, amber, lime, green and sky were too light to reach 3:1 as lines.

Palette, light values, old and new:

| Token or recipe | Old | New |
| --- | --- | --- |
| --slab-face | oklch(0.97 0.003 85) | oklch(0.988 0.003 255) |
| --slab-edge | oklch(0.87 0.006 80) | oklch(0.87 0.014 256) |
| --slab-deep | oklch(0.87 0.006 80) | oklch(0.86 0.008 256) |
| --slab-shadow | oklch(0.3 0.025 65 / 0.15) | oklch(0.3 0.05 264 / 0.15) |
| --tray-floor | oklch(0.955 0.004 85) | oklch(0.974 0.003 255) |
| --tray-sink | oklch(0.925 0.005 85) | oklch(0.95 0.005 255) |
| --tray-plate | oklch(0.975 0.003 85) | oklch(0.988 0.003 255), then removed by TASK-423 |
| words (new tokens) | --card-foreground oklch(0.17 0.006 75), --muted-foreground oklch(0.48 0.008 75) | --diagram-text oklch(0.2 0.02 265), --diagram-text-muted oklch(0.47 0.028 262), dark values the shell's |
| grouped card face | OKLCH L 0.955, C 0.022 | OKLCH L 0.972, C 0.011 |
| grouped card edge | sRGB 32 % of the colour over grey: L 0.77 to 0.84, C 0.05 to 0.11 | OKLCH L 0.76, C 0.12 (teal 0.104, cyan 0.107) |
| chip face | sRGB 14 % over the face: L 0.90 to 0.94, C 0.02 to 0.05 | OKLCH L 0.945, C 0.025 |
| chip edge | sRGB 32 % over the edge | OKLCH L 0.78, C 0.10 |
| chip glyph | the colour with 30 % near-black | the colour itself |
| --semantic-orange | oklch(70.5% 0.213 47.604) | oklch(0.634 0.179 44) |
| --semantic-amber | oklch(76.9% 0.188 70.08) | oklch(0.625 0.138 63) |
| --semantic-lime | oklch(64.8% 0.2 131.684) | oklch(0.602 0.165 133) |
| --semantic-green | oklch(62.7% 0.194 149.214) | oklch(0.598 0.172 147) |
| --semantic-emerald | oklch(59.6% 0.145 163.225) | oklch(0.6 0.13 161) |
| --semantic-teal | oklch(60% 0.118 184.704) | oklch(0.603 0.104 184) |
| --semantic-cyan | oklch(60.9% 0.126 221.723) | oklch(0.607 0.107 220) |
| --semantic-sky | oklch(68.5% 0.169 237.323) | oklch(0.612 0.136 241) |
| --semantic-fuchsia | oklch(66.7% 0.295 322.15) | oklch(0.657 0.295 322) |
| --semantic-pink | oklch(65.6% 0.241 354.308) | oklch(0.65 0.25 354) |
| red, blue, indigo, violet, purple, rose | already 3.6:1 or more | kept |
| --standing-added | oklch(64.8% 0.2 131.684) | oklch(0.6 0.18 140) |
| --standing-changed | oklch(0.69 0.19 48) | oklch(0.631 0.167 48) |

Rule for the named colours: each sits at the lightest tone that reaches 3.6:1 on the page. It keeps its own hue and about 97 % of the chroma that sRGB holds there. Yellow is the gold of TASK-419 and is not part of this.

Contrast, WCAG 2, light theme, worst case over the 16 colours other than yellow (yellow in brackets):

| Pair | Before | After |
| --- | --- | --- |
| card name on a grouped face | 16.66 (orange) | 16.57 (fuchsia) |
| card description on a grouped face | 5.70 (orange) | 6.27 (fuchsia) |
| name and description on a neutral face | 17.55 and 6.01 | 17.48 and 6.61 |
| words on a label | 19.13 | 18.10 |
| glyph on its chip | 3.29 amber (yellow 3.03) | 3.11 fuchsia and pink (yellow 2.16) |
| line on the page | 2.09 amber (yellow 1.86) | 3.58 fuchsia (yellow 2.47) |
| line on a tray floor | 1.82 amber | 3.40 fuchsia |
| line on a floor nested twice | 1.76 amber, nested once | 3.22 fuchsia |
| neutral line: page, floor, nested twice | 3.86, 3.48, 3.35 nested once | 3.86, 3.66, 3.47 |
| added mark: page, nested twice | 2.97 | 3.61, 3.24 |
| changed mark: page, nested twice | about 2.9 | 3.60, 3.24 |
| removed mark: page, nested twice | 6.3 | 6.34, 5.71 |

Dark theme, worst case, unchanged: description 5.20 (emerald), glyph 3.29 (indigo), line on the page 3.96 (indigo).

A new test owns these numbers: src/runtime/semantic-renderer/tests/palette-contrast.test.ts. It checks the words on every group's face in both themes. It checks the glyph and the line of every colour but yellow in the light theme.

Not changed by TASK-422: the group region tones (frame, corners, tab, caption) in regions.ts, which TASK-419 owns. They use toned() with a chroma cap of 0.12, so the deep corners and tabs look muted (violet tab C 0.12 at L 0.52). Yellow as the gold stays under 3:1 as a line and a glyph. The tray recipe and the container header, which TASK-423 owns.

Front edges and grouped faces (commits 36dc4360c, c4c2d8843, 05f4ed20a).

The owner found that a light front edge read as a highlight, and that a dark grouped edge was as light as its face. A front edge is now the face in shade: the same material at a lower lightness, never a lighter or brighter strip.

| Recipe | Old | New |
| --- | --- | --- |
| --slab-edge, light (neutral edge) | oklch(0.87 0.014 256), 1.43:1 under the face | oklch(0.83 0.003 255), 1.63:1 |
| --slab-shadow, light | oklch(0.3 0.05 264 / 0.15) | oklch(0.3 0.05 264 / 0.16) |
| grouped edge, light | OKLCH L 0.76, C 0.12 | OKLCH L 0.78, C 0.084, 1.61 to 1.67:1 under its face |
| grouped face, light | OKLCH L 0.94, C 0.028 for every colour | OKLCH L 0.93, C 0.031 (blue, indigo) to 0.055 (lime to teal), yellow 0.042 |
| chip edge, light | OKLCH L 0.78, C 0.10 | OKLCH L 0.78, C 0.06 |
| grouped edge, dark | the colour mixed 30 % into oklch(0.06 0.002 75): 1.00 to 1.26:1, often lighter than its face | OKLCH L 0.212, C 0.042, 1.33 to 1.35:1 under its face, as a neutral edge (1.33:1) |

Words on a grouped face: 5.47:1 or more in light (fuchsia), 5.20:1 or more in dark (emerald). The chip faces and edges in dark already stood 1.31 to 1.34:1 apart and keep their values. The header slab of a container takes the card recipe through cardLook. The palette-contrast test holds the step: the edge is darker than its face by 1.3:1 or more, in its face's hue, in both themes. It also holds the face hue within 6 degrees of its group and a chroma over 0.028.

More saturated grouped faces (commit ca2038106). The owner asked for more saturation on grouped cards.

Light face per colour, OKLCH lightness and chroma, old and new (the old one was L 0.93 for every colour):

| Colour | Old C | New L, C | New face |
| --- | --- | --- | --- |
| red | 0.033 | 0.89, 0.053 | #fccec9 |
| orange | 0.035 | 0.89, 0.057 | #fcd0bd |
| amber | 0.043 | 0.89, 0.069 | #fcd2ac |
| yellow (gold) | 0.042 | 0.92, 0.055 | #fae1bc |
| lime, green, emerald, teal | 0.055 | 0.92, 0.07 | #d3efc0, #c7f2ca, #bcf4d6, #b0f4ea |
| cyan | 0.046 | 0.89, 0.07 | #a6e6fb |
| sky | 0.034 | 0.89, 0.055 | #bbe0fc |
| blue | 0.031 | 0.89, 0.049 | #c8dcfc |
| indigo | 0.031 | 0.89, 0.05 | #d2d8fc |
| violet | 0.034 | 0.89, 0.054 | #dcd5fc |
| purple | 0.039 | 0.89, 0.062 | #e4d1fd |
| fuchsia | 0.052 | 0.89, 0.07 | #f1ccf7 |
| pink | 0.037 | 0.89, 0.06 | #fccbdd |
| rose | 0.033 | 0.89, 0.053 | #fccdce |

Dark face: L 0.31, C 0.032 before, C 0.048 now. Light edge: C 0.084 before, C 0.096 now (L 0.78). Dark edge: C 0.042 before, C 0.054 now (L 0.212).

Contrast: the description on a grouped face keeps 4.80:1 or more in light (fuchsia and pink) and 5.19:1 or more in dark (emerald). The name keeps 12.7:1 or more in light. The edge stays 1.42:1 or more under its face in light and 1.33:1 in dark. The chip face (L 0.945) stays lighter than every grouped face.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: Text on every surface reaches 4.5 to 1, and marks that carry meaning reach 3 to 1, reached by clean, deep ink and strong colors on bright surfaces and not by washing the colors out, and the numbers are in the task notes
Original criterion 3: The dark theme looks as it does now, and the layout of every board is unchanged

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The light picture uses vivid colors and clear surfaces. Later accepted APCA and dark-neutral choices define the final palette. Palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
