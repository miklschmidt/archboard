---
id: TASK-414
title: >-
  The tray is lit from above, its walls are neutral, and its header casts no
  shadow below
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 11:38'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 701000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner looked at the inset container (the tray, TASK-412) in the dark theme and found three faults (screenshot /home/msc/Pictures/Screenshots/screenshot-2026-10-06--13:35:57.png). First, the light comes from the top left, with shaded top and left walls and a lit bottom and right lip, but every other element is lit from straight above. Second, the walls are tinted by the container kind and look navy blue, and they should not be tinted. Third, the shadow under the front edge of the nameplate makes the header look strange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tray is lit from straight above like the slabs: the top wall is in shade and throws a short shadow down onto the floor, the left and right walls match each other and are quieter, and the bottom wall is lit
- [x] #2 Tray walls and floors are neutral. The header uses the placing group color from TASK-423 instead of the container kind.
- [x] #3 The header follows TASK-423: a raised slab with a shadow below every card and line.
- [x] #4 The owner has seen the result in both themes and on nested trays and keeps it, and ADR 0044 and DESIGN.md say how the light falls
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read lib/svg/tray.ts and trayLook in appearance.ts and see how the walls, the lip, the floor shadow and the nameplate shadow are made. 2. Light the tray from above: shade the top wall, shadow the floor under the top wall, make the left and right walls equal and quieter, light the bottom wall. 3. Mix the wall shades from neutral tokens only. 4. Remove the shadow under the nameplate front edge. 5. Render the Web shop, the Nesting check board and the Archboard server board in both themes, before and after, and show the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 4b0f3786. Light from above: the top wall (7 units) is in shade and throws a short, soft shadow straight down (two 1.5-unit bands at 0.5 and 0.2 of --slab-shadow) on what lies under it, the nameplate's face. The side walls are alike, 3 units each, quieter. The bottom shows a 2-unit lit lip (--tray-lip) with a 1-unit crease below it. The side-wall face has rounded top corners, so the top wall turns down round each top corner as the lip turns up round each bottom corner: one carved shape, no left-right difference. The floor is inset 3 units from each side and from the bottom. Walls are neutral: mixed from the floor before its kind tint (with its nesting sink) toward --slab-deep. Top wall light 0.8 (#dcd9d6, L 0.887, C 0.006), dark 0.45 (#090908, L 0.139). Side walls light 0.4 (#e6e5e1, L 0.921), dark 0.28 (#0c0b0b, L 0.151). Before: top and left walls 7 units at 0.8 / 0.55, then 0.15 of the kind (on a blue service light #c1ccdc C 0.025, dark #0d1117 navy); a 3-band shadow down the top and the left; a 4-band shadow under the nameplate. Now no shadow under the nameplate: its 3-unit front edge in the kind is the line origin. The floor keeps the kind tint (0.045 / 0.12) and the nameplate keeps its tones. Test: grouping.test.ts holds the walls under 0.012 OKLCH chroma and the nameplate in the kind's hue. ADR 0044 (intro, rules 3, 4, 5), DESIGN.md and the theme.css notes now say the picture is lit from above. Renders: scratchpad proposals/slabs-s/tray-light-ab (1:1 pairs and 2x crops in crops/), full sets n0 (before) and n3 (after).

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: The walls are neutral shades of the page and the floor and carry no color of the container kind, while the floor and the nameplate keep the kind tint
Original criterion 3: The nameplate casts no shadow below its front edge

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tray walls use neutral tones and light from above. Later accepted tasks define the neutral floor and raised group-tinted header. Tray and shadow owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
