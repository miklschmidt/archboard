---
id: TASK-419
title: >-
  A group is a thin faded frame with full-color corners and a tab, and yellow is
  the gold of the product
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
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 706000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner picked look D of TASK-416: a thin continuous frame in a faded tone of the group color, four thick L-shaped corner brackets in the full color, and a full-color tab merged into the top-left bracket. The owner wants the frame to be 3 units, and hates the yellow group color, which is ugly, and asked for the gold accent of the product in its place. The look was built as a prototype behind a switch (ARCHBOARD_GROUP_LOOK, commits 89b3c099 and 11ba5e2a).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A group region is drawn as look D with a frame of 3 units for every board, in both themes, near and far, and the prototype switch and the other looks are removed
- [x] #2 The color named yellow in the vault palette is the gold of the product (the --primary and --primary-mark family of theme.css) in the light and the dark theme, for groups, kinds and relationships, and DESIGN.md says that this color is the one shared use of the gold
- [x] #3 Group corners meet APCA Lc 30 against the page and floors, captions meet Lc 60, and text on gold cards remains readable under TASK-432.
- [x] #4 ADR 0038, ADR 0044 and DESIGN.md describe the group region and the gold, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit d9a9220c. Look D is the only group look: a 3-unit frame (FRAME_WIDTH) in the faded tone FRAME (light L 0.74, dark L 0.47, chroma share 0.6), four L brackets (BRACKET_WIDTH 6, ARM 28) and the tab in the full tone CORNER (light L 0.60, dark L 0.74, chroma share 1 and 0.95, cap 0.12), the words in WORDS (L 0.16, share 0.2, a deep shade of the group's hue in both themes, so on gold it is the dark gold ink). The region's first shape is its box, unpainted. The prototype switch, group-looks.ts, looks a to c, the old tab (shadow, edge, glint), the hairline and foot, REGION_FOOT and TAB_THICKNESS are removed. The tones are named constants at the top of regions.ts, to retune with the light palette of TASK-422. Changes from the prototype D: the light full tone went from L 0.52 with light words to L 0.60 with dark words, and the dark one from L 0.66 to 0.74: dark words are what gold needs (--primary-foreground), one recipe for every color, and gold at L 0.66 on graphite read as mustard. Gold: --semantic-yellow is the gold mark of the shell, light oklch(0.72 0.15 77) (--primary-mark), dark oklch(0.86 0.125 86) (--primary-mark and --primary-text dark). A yellow group: light tab #a87514 with words #1c1509, dark tab #cba54f. Contrast with the current tokens (including TASK-422's uncommitted light tokens): full color at least 3.26 light and 7.44 dark against page, tray floor and nested floor; tab words at least 4.63 light and 8.01 dark; faded frame 1.96 to 2.09 light, 2.55 to 2.76 dark. DESIGN.md: the One Gold Rule now says the palette's yellow is the gold on purpose. ADR 0038 and ADR 0044 rule 6 and 14 updated. Renders: scratchpad proposals/slabs-s/group-d-ab (HEAD before, HEAD plus this change after, Web shop, queued, Agent workbench, light and dark, near and far).

Rework d34f31d79 (after TASK-422 made the light named colours vivid): light corners and tab are the named colour itself with its lightness held between 0.615 and 0.645 (heldTone in colour.ts, no chroma cap); light frame toned at L 0.78, chroma share 0.875 of the capped chroma. Measured over 17 colours on light: tab vs page 3.27 to 4.08, vs nested floor 3.03 to 3.79, words on tab 4.64 to 5.78, frame vs page 1.86 to 2.04. Dark unchanged. Card face light recipe now owned by TASK-422. Renders: scratchpad proposals/slabs-s/vivid-ab (every/ for all 17 colours).

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 3: The corners and the tab reach 3 to 1 against the page and tray floors, the words on the tab reach 4.5 to 1, and a card in a yellow group stays readable

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Groups use the accepted thin frame with colored corners and a caption tab. Yellow uses the product gold. Group and APCA palette owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
