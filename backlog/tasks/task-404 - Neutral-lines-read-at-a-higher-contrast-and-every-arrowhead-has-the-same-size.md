---
id: TASK-404
title: Neutral lines read at a higher contrast and every arrowhead has the same size
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 09:53'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 691000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner said that a neutral line no longer has to match the border of a card, because cards have no border now, so its contrast can go up. The owner also still sees tiny arrowheads on HTTP relationships in the dogfood vault. The vault configuration is not the cause: the HTTP kind says a filled head. The tiny heads are on relationships that the board authored as muted, and a muted head is 6 units while a default or emphasized head is 11 (HEAD_LENGTH in lib/svg/styles.ts, chosen in TASK-403). A head that small is hard to read in the picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Neutral relationship ink and lifelines meet the APCA mark threshold from TASK-432 against the page and tray floors in both themes, and remain quieter than text.
- [x] #2 Every arrowhead has the same length whatever the emphasis of its relationship, and emphasis changes the weight of the line only
- [x] #3 Colored relationship contrast is measured with APCA, and exceptions to the mark threshold are listed in the notes.
- [x] #4 ADR 0044 and DESIGN.md state the new line ink and the one head length, and the README pictures that the change made stale are made again or listed
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the contrast of the neutral line ink (--diagram-edge) and of the colored kinds against the page and against plinth faces, in both themes, for architecture lines, sequence messages and lifelines. 2. Raise the neutral ink to at least 3 to 1 and judge by looking that it stays quieter than text. 3. Give the muted head the same length as the others (HEAD_LENGTH in lib/svg/styles.ts), and update the tests, ADR 0044 rule 11 and the DESIGN.md text that name the muted head. 4. Say in the notes that the HTTP kind in the vault configuration is not the cause. 5. Render every review board in both themes, run bun run check, and make the README pictures again or list them.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause of the tiny HTTP heads: not the vault config (http is a filled head). They were relationships authored muted, whose head was 6 long. HEAD_LENGTH is now 11 for every weight (commit 014b9e13c). Head audit over both review vault copies, every variant and view, both engines: 408 drawings, 9218 marker references, no head over a bend, a label or a card it does not point at. --diagram-edge moved from oklch 70.5 and 44.2 percent to oklch 60 percent in both themes. WCAG contrast measured from theme.css with the project's theme reader (lightningcss) and sRGB mixing: light 3.86:1 page and 3.48:1 plinth face (was 2.55 and 2.31), dark 4.56:1 page and 4.31:1 plinth face (was 2.34 and 2.21), text about 16 to 19:1. The lifeline now takes the same ink (it was --muted-foreground, darker than the messages). LINE_STRENGTH is now 1 on the light ground and 0.75 on the dark. Coloured lines still under 3:1 against the light page at full colour: orange 2.75, amber 2.09, yellow 1.86, lime 2.99, sky 2.68 (HTTP). Every colour is 3.9:1 or more on the dark page. BoardPage.tsx draws its part cards with a border in --diagram-edge, which is now darker: left for the viewer agent (src/ui).

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 1: The ink of a neutral relationship line is at least 3 to 1 against the page and against a plinth face in the light and the dark theme, and it is still clearly quieter than text, in architecture boards and in sequence views including lifelines
Original criterion 3: The contrast of colored relationship lines is measured, and any that fall under 3 to 1 against the page are raised or are listed in the notes

README completion: architecture, sequence, Web shop and banner assets were regenerated and inspected. Stale assets listed for a person: hero, plan, history, drill-down, take-back, ask, explainer, pr-walkthrough and newcomer. The last four need Codex access. No assets were uploaded.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Neutral lines use the accepted APCA contrast levels, and all arrowheads use one length. The palette owners and full gate pass. README evidence lists the remaining clips. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
