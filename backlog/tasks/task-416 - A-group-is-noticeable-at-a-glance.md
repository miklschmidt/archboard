---
id: TASK-416
title: A group is noticeable at a glance
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 12:05'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 703000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the colored background of a group was dropped (TASK-415) the owner finds that groups are almost impossible to notice at a glance, especially on large boards such as Agent workbench (screenshot /home/msc/Pictures/Screenshots/screenshot-2026-10-06--14:03:53.png), and that the bottom edge of the region looks bad. The owner said that if the colored outline stays it needs to be thicker, and asked for three examples of a new way to show a group. The owner picks one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Three examples of a group region exist as pictures of the same boards in both themes and in the near and the far view, each noticeable at a glance without a colored background, and none draws the old bottom edge
- [x] #2 The owner picks one, and it is built for every board, with the card tint and the colored card edge kept, and ADR 0038, ADR 0044 and DESIGN.md say how a group is drawn
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build three looks for a group region behind one switch that only the server reads (ARCHBOARD_GROUP_LOOK), as a prototype commit that is removed after the owner picks. 2. Render each look on the Agent workbench container, the Web shop, its queued proposal and the Archboard server board, in both themes, near and far, side by side with the current look. 3. The owner picks. 4. Build the pick for real, remove the switch and the other looks, update tests and docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prototype commit 89b3c099 (revert it after the pick): ARCHBOARD_GROUP_LOOK=a|b|c, read only where process exists (lib/svg/group-looks.ts, hooks in regions.ts). A frame: 4-unit rounded outline in a solid group tone, no foot, no fill, the solid tab grown from the corner. B banner: solid band across the top, 24 units near with 15-unit words, as tall as the caption row with the far words from far away, 2-unit sides and bottom. C corner marks: four 4-unit L brackets with 28-unit arms round the rounded corners, plus the solid tab. Solid tone light L 0.72, dark L 0.66, chroma share 1 / 0.95 (cap 0.12); words on it light L 0.22, dark L 0.20: at least 6.69:1 light and 5.56:1 dark. The light solid is only 2.29:1 against the page and 2.06:1 against a tray floor (under 3:1 for a mark): darken it if A, B or C is picked. Renders: scratchpad proposals/slabs-s/looks (cur, a, b, c folders; sheets/ has labeled contact sheets per board, theme and view; crops/ has 2x crops of Voice, the queued Payments and Fulfilment; looks-s.sh and looks-sheets.sh rebuild them).

Look d (commit 11ba5e2a, still part of the prototype): a 2.5-unit frame in a faded tone of the group color, 6-unit corner brackets with 28-unit arms over it, and the solid tab merged into the top-left bracket. The frame and the brackets share their outer edge, so a bracket covers the frame under it with no seam or bulge; at each arm's end the line steps from 6 to 2.5 units. The fade is a computed tone, never opacity: light L 0.74, dark L 0.47, chroma share 0.6 (the full color has 1 light and 0.95 dark), about a third of the corners' strength. Full color: light L 0.52 (was 0.72 in A and C), dark L 0.66 as before. Words on the tab: light L 0.985 (light words on the deeper color), dark L 0.20. Contrast: tab words at least 4.89 light and 5.56 dark; corners and tab at least 4.16 light against page, tray floor and nested floor, 5.49 dark; faded frame light 2.17 to 2.32 against the page, 1.96 to 2.09 against a tray floor, 1.82 to 1.95 against a nested floor; dark 2.55 to 2.76, 2.69 to 2.91, 2.80 to 3.04. Renders: scratchpad proposals/slabs-s/looks-d (sheets/ current, A, C, D per board, theme and view; crops/ A, C, D at 2x; looks-d.sh rebuilds them).

The owner picked look D (a thin faded frame, thick full-color corner brackets and a full-color tab) on 2026-10-06 and asked for a frame of 3 units, not 2.5. The yellow group color is replaced by the gold of the product (TASK-419).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The owner selected look D from the recorded examples. The renderer applies that choice to every board. Group owners pass, and the prototype switch is removed. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
