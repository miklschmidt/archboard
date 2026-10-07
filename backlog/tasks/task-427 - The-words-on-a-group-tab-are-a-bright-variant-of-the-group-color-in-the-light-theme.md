---
id: TASK-427
title: >-
  The words on a group tab are a bright variant of the group color in the light
  theme
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
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
ordinal: 714000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The group colors in the light theme are deep and vivid, so the label text on the tab of a group is hard to read. The owner wants the text to be a very bright, light variant of the group color.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Light group captions use bright group ink and meet APCA Lc 60. Gold uses the primary ink on the primary gold from TASK-432.
- [x] #2 The far-view caption follows the same rule. Both themes use TASK-432 contrast choices, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 79224cc09. regions.ts: CORNER light held at clamp(0.5, l, 0.525) (tab and corners, hue and chroma whole); WORDS light toned at lightness 0.98, chroma share 0.15 of the capped chroma (a bright tint, near and far); dark unchanged. Over 17 colours on light: words on tab 4.69 (green) to 5.86 (purple); gold tab #995a00 with words #fff7eb at 5.17; tab vs page 4.80 to 6.08, vs nested floor 4.46 to 5.64. group-regions.test.ts adds green and checks the light words are brighter than the tab. Renders: scratchpad proposals/slabs-s/tab-words-ab (every/ for all 17).

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 1: The words on the tab of a group in the light theme are a very light variant of the group color, at least 4.5 to 1 against the tab, for all 17 colors including the gold
Original criterion 2: The same rule is applied to the caption in the far view, the dark theme is unchanged, and bun run check passes

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Group captions use bright group ink, with primary ink on the gold tab. Near and far captions meet the accepted APCA level. Palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
