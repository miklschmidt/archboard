---
id: TASK-413
title: A group mat is clean and alive in color on the page and on a tinted tray floor
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 11:11'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
ordinal: 771000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner does not love the group backgrounds (the mats behind grouped cards). Asked what is wrong, the owner said that they are muddy on containers, and that in general they are really muddy and the colors look very sad and pale. A mat is a translucent tint of the group color mixed in sRGB over whatever lies under it, so on a tinted tray floor it mixes into a dull color, and mixing toward a grey page loses chroma.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Group regions follow the later owner choice in TASK-415 and TASK-419: no colored face, with a faded frame, full-color corners and a caption tab.
- [x] #2 Group captions and card text meet the APCA thresholds from TASK-432, and the cards retain their group color.
- [x] #3 The owner selection of the replacement group frame is recorded in TASK-416 and TASK-419.
- [x] #4 ADR 0038 and ADR 0044 describe the selected group frame, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Look at how a mat face, edge and tab are mixed today (lib/svg/slab.ts, regions.ts, appearance.ts, mixed in lib/svg/colour.ts) and what lies under a mat on a page, a tray floor and a nested floor. 2. Make the mat face opaque and mix in OKLCH so that chroma stays: for example a light surface plus a share of the group color on the light ground, and a deep saturated shade of the group ink on the dark ground. 3. Compare before and after for the violet, teal, orange, yellow and lime groups on the page and on a blue tray floor, in both themes. 4. Keep text at 4.5 to 1. 5. Update ADR 0038 and ADR 0044, then show the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 72eda4b2. Diagnosis: the old mat face was already opaque. It was the group color mixed in sRGB into --mat-face, a warm grey (light 0.985, dark 0.235), at 9 % on light and 11 % on dark. The sRGB mix turned the hue and kept only 0.014 to 0.029 OKLCH chroma on light, at L about 0.95, which is as light as the tray floor and lighter than the cards on it (L 0.93). On dark it gave L 0.29 to 0.31, as light as the cards, with 0.015 to 0.038 chroma, so it read brown-grey. New recipe: every group surface is a relative OKLCH color of the group token, oklch(from var(--semantic-x) L calc(min(c, 0.12) * k) h), through toned() in lib/svg/colour.ts. Mat face light L 0.93 k 0.27 (chroma 0.032), dark L 0.25 k 0.3 (0.036). Tab light 0.885 k 0.46, dark 0.315 k 0.48. Mat edge light 0.80 k 0.7, dark 0.43 k 0.62. Tab edge light 0.83 k 0.6, dark 0.40 k 0.55. Caption light 0.44 k 0.9, dark 0.88 k 0.6. Grouped card face light 0.955 k 0.18 (0.022), dark 0.31 k 0.27 (0.032), a step lighter than its mat. --mat-face and --mat-edge are removed. Contrast: caption on tab at least 5.18 light (yellow 5.53, amber 5.60, lime 5.38) and 8.87 dark; caption on mat at least 5.90 light; secondary words on a grouped card at least 5.69 light and 5.22 dark. The test resolver in drawn-colours.ts reads relative OKLCH and matches Chrome's pixels exactly. New test in group-regions.test.ts: one opaque mat on page and floor, caption 4.5:1 for yellow, amber and lime. ADR 0038, ADR 0044, DESIGN.md and docs/agents/frontend.md updated. Before and after: scratchpad proposals/slabs-s/mat-ab.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 1: A group mat has a clean, lively color in the light and the dark theme, with more chroma than today, and it looks the same on the page, on a tray floor and on a nested floor, because its face is opaque
Original criterion 2: The mat, its tab and the cards on it are still readable (text at 4.5 to 1), the group color on the card edge and face stays, and a mat is never louder than the cards on it
Original criterion 3: The owner has seen the result on the Web shop board, the Archboard server board and a board with a group inside a tinted container, in both themes, and keeps it
Original criterion 4: ADR 0038 and ADR 0044 say how a mat is colored, and bun run check passes

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The owner replaced colored mats with the accepted empty group frame. The cards retain their tint. Group and palette owners pass with the documented choice. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
