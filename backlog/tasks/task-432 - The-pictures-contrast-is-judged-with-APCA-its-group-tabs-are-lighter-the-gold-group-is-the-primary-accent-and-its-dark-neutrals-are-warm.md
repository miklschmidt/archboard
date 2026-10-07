---
id: TASK-432
title: >-
  The picture's contrast is judged with APCA, its group tabs are lighter, the
  gold group is the primary accent and its dark neutrals are warm
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 23:01'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
  - accessibility
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
  - PRODUCT.md
  - DESIGN.md
ordinal: 718000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner finds the WCAG 2 contrast ratio a poor judge of what reads well and decided that APCA (the Accessible Perceptual Contrast Algorithm) judges the contrast of text and of marks, in place of the WCAG 2 ratios of 4.5 to 1 and 3 to 1. Holding the light group tabs and corners to 4.5 to 1 made them so dark that the owner finds them terrible. The owner also wants the yellow group to use the accent color of the primary buttons. In the dark theme the well of a container and the cards read as a cool, bluish grey beside the warm graphite of the shell, because the picture's dark neutrals carry almost no chroma and the neutral line ink has a violet hue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tests of the picture measure contrast with APCA Lc values (apca-w3), each threshold named after its APCA level, and no test of the picture holds a WCAG 2 ratio
- [x] #2 PRODUCT.md, DESIGN.md, ADR 0044 and the docs that state the contrast rule say that text and marks are judged with APCA, with the levels used
- [x] #3 The light group tab and corners are a lighter, livelier tone of the group's color, and the bright words on the tab reach Lc 60 for every color
- [x] #4 The yellow group's tab is the primary gold with the primary ink on it, and the named yellow equals the shell's gold accent in both themes
- [x] #5 The dark neutrals of the picture are the warm graphite of the shell, with every lightness kept
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commits 62a9b9f8d (code and tests) and 7e1850bea (PRODUCT.md, DESIGN.md, ADR 0044 rule 17).

APCA: the picture's tests measure Lc with apca-w3 0.1.9 (one local declaration in src/runtime/semantic-renderer/tests/apca-w3.d.ts, held by a fixture test). The levels are `APCA` in drawn-colours.ts. A card's name keeps Lc 75. A card's description and a group's caption keep Lc 60. A pin's mark keeps Lc 45. A line, a corner, an outline or a glyph keeps Lc 30, the floor. A muted line keeps Lc 15. A card's description is held at Lc 60, APCA Bronze's level for content text that is not body text. At 11 units, Lc 75 makes the secondary ink nearly as dark as a card's name.

Group tab and corners, light: each colour at its own OKLCH lightness, the lightest at which the bright words reach Lc 60.

| Colour | Tab before | Words Lc before | Corner Lc on page before | Tab after (L) | Words Lc after | Corner Lc on page after |
| --- | --- | --- | --- | --- | --- | --- |
| red | #d10009 | 75 | 73 | #ff4044 (0.68) | 60 | 59 |
| orange | #b83900 | 78 | 76 | #e7651f (0.66) | 60 | 58 |
| amber | #a05400 | 78 | 75 | #cb7b21 (0.655) | 60 | 58 |
| yellow (gold) | #995b00 | 77 | 75 | #f0c056, --primary, dark ink | 73 | 47 (--primary-mark) |
| lime | #417c00 | 76 | 73 | #62a024 (0.64) | 60 | 57 |
| green | #008322 | 75 | 71 | #29a546 (0.635) | 60 | 57 |
| emerald | #008051 | 75 | 72 | #27a270 (0.635) | 61 | 57 |
| teal | #007d71 | 76 | 72 | #27a093 (0.64) | 60 | 57 |
| cyan | #007894 | 76 | 73 | #269bb8 (0.64) | 60 | 57 |
| sky | #0071b0 | 76 | 74 | #2996d8 (0.645) | 60 | 58 |
| blue | #0861dd | 78 | 75 | #3c8cff (0.66) | 60 | 58 |
| indigo | #534bea | 79 | 77 | #7d81ff (0.685) | 60 | 58 |
| violet | #7737e3 | 80 | 78 | #a570ff (0.685) | 60 | 58 |
| purple | #8d20dc | 80 | 78 | #bf60ff (0.685) | 61 | 58 |
| fuchsia | #b100ca | 76 | 74 | #e631ff (0.68) | 60 | 57 |
| pink | #c90074 | 75 | 74 | #fd2e9e (0.665) | 60 | 58 |
| rose | #d00032 | 75 | 73 | #ff3e5f (0.68) | 60 | 58 |

Dark: the tab lightness went from 0.74 to 0.765. The words now reach Lc 60 to 65 for every colour (before 56 to 61). The corners keep Lc 58 to 63 on the page. The gold tab has Lc 73, and its corners Lc 77. The faded frame is Lc 35 to 39 on the light page and Lc 17 to 19 on the dark.

Changes that keep the levels in the dark theme:
- --diagram-text-muted 0.72 to 0.81. Descriptions go from Lc 48 to Lc 63.
- LINE_STRENGTH dark 0.75 to 0.8. The indigo line goes from Lc 29 to Lc 32.
- --standing-removed dark oklch(70.4% 0.191 22.2) to oklch(0.76 0.16 22). A ghosted removed line goes from Lc 27 to Lc 33.
- In light, --diagram-text-muted 0.47 to 0.45. The lowest description goes from Lc 61 to Lc 63.

Dark neutrals: hue 75 at the shell's chroma, every lightness kept: --tray-floor, --tray-sink, --tray-lip, --slab-face, --slab-edge, --slab-deep, --slab-shadow, --port-wall, --port-deep, and --diagram-edge oklch(0.6 0.012 80) in place of the violet hue 286. The dark floor is now srgb(20,18,16) beside the ground srgb(24,22,19), before srgb(19,19,18).

Light neutrals, unchanged: the chalk ground is srgb(252,252,250) (blue under red), the tray floor srgb(245,246,248) (blue over red by 3). The floor reads a hair cooler than the ground, the same effect in a much smaller dose.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Picture contrast uses APCA levels. Group tabs use brighter tones, yellow matches the shell gold, and dark neutrals use warm graphite. Palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
