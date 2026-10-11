---
id: TASK-415
title: 'A group has no background color, and its cards keep their tint'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 11:40'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 773000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the group mats were made cleaner (TASK-413) the owner still does not want a colored background behind a group, and asked to drop it and keep the tint on the cards. A group still has to read as a region that gathers its cards, with its caption.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A group region has no colored face in the light and the dark theme, on the page, on a tray floor and on a nested floor
- [x] #2 A group is still a clear region with its caption tab, a boundary in the group color and a name, and the cards in it keep the group tint on the face and the group color on the front edge
- [x] #3 The standing marks, the selection ring and the far view still work, and a group inside a container reads well
- [x] #4 ADR 0038, ADR 0044 and DESIGN.md say how a group region is drawn, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the colored face of the mat in lib/svg/slab.ts and regions.ts. 2. Choose what marks the region without a face: a neutral board that matches what lies under it, a boundary and a foot in the group color, and the tab. Judge by looking. 3. Keep the card tint and the card edge. 4. Render the Web shop, its queued proposal, the Archboard server board and a group inside a container in both themes, before and after. 5. Update tests, ADR 0038, ADR 0044 and DESIGN.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit a271dd1e. A group region has no face: nothing fills it, so the page, a tray floor or a nested floor shows through and it looks the same everywhere. It is marked by a 1-unit hairline of the group color on its box edge, a 3-unit foot of the color along its bottom that follows the rounded corners (both the BOUNDARY tone: light L 0.80, dark L 0.43, chroma share 0.7 / 0.62), and the caption tab as before (tab face, tab edge and caption tones unchanged; caption on tab at least 5.18:1 light, 8.87:1 dark). Cards keep their toned face and colored front edge unchanged. Options compared on the Web shop queued proposal (Payments inside the Checkout API tray), both themes: hairline and foot with no fill; a translucent white lift with the foot; both. The lift vanished on the light page and showed only on a tray floor, so a region looked different by ground; the hairline with no fill reads the same on every ground and keeps the colors the owner liked. Removed MAT_FACE and the slab face of the region; MAT_THICKNESS renamed REGION_FOOT. Tests: group-regions.test.ts holds no filled rect in a region, the same boundary on page and floor, and caption contrast. ADR 0038, ADR 0044 and DESIGN.md updated; ADR 0038 also says the tray walls are neutral now. Renders: scratchpad proposals/slabs-s/region-ab (before HEAD n3, after r1; options in options/).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Group regions have no colored background. Their frame and caption preserve the group identity, and their cards retain the tint. Group owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
