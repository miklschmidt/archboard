---
id: TASK-426
title: Uncolored cards are not pure white in the light theme
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 19:31'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 713000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the light theme an uncolored card looks too bright to the owner: it seems to start at pure white at the top. The face gradient and the lit top edge begin at white.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An uncolored card face in the light theme has no pure white anywhere, its top starts at a soft off-white, it keeps a gentle top to bottom change, and it still stands off the page, the tray floor and the chip
- [x] #2 Face text meets the APCA threshold from TASK-432. The dark appearance follows that task, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit af275a1bd. Measured at 4x on the Storefront card, light theme.

| Part | Before | After |
| --- | --- | --- |
| top edge of a plain face | #FEFEFF, L 0.997 | #F7F8F9, L 0.979 |
| top of the face | L 0.991 | L 0.969 |
| foot of the face | L 0.989 | L 0.960 |
| --slab-face | oklch(0.988 0.003 255) | oklch(0.96 0.004 255) |
| --slab-sheen (chips) | white at 0.8 | white at 0.3 |
| glint share on the light ground (slab.ts) | 0.85 toward white | 0.45 |
| --slab-edge | oklch(0.83 0.003 255) | oklch(0.815 0.003 255), 1.59:1 under the face |
| chip face, light | OKLCH L 0.945, C 0.025 | L 0.955, C 0.02 |
| label face, light | --popover, pure white | --slab-face |

Nothing on a plain card reaches L 0.99 now. The card stands off the page (0.99) and a tray floor (0.974) by its shadow and its shade edge. A grouped face starts at its own tint (teal L 0.933 under a top edge of L 0.954), not at white. Words on a plain face: name 16.1:1, description 6.1:1. The dark theme keeps its values.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: Text on the face stays at 4.5 to 1 and the dark theme is unchanged, and bun run check passes

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Uncolored light cards use a soft off-white face. The final APCA palette keeps their text readable. Palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
