---
id: TASK-395
title: >-
  The shell geometry describes the shell, and the renderer lays boards out for a
  tuned page shape
status: Done
assignee:
  - '@claude'
created_date: '2026-10-04 21:31'
updated_date: '2026-10-04 23:07'
labels:
  - renderer
  - ui
dependencies: []
references:
  - src/shared/shell-geometry/index.ts
  - >-
    docs/adr/0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md
  - docs/adr/0039-a-drawing-is-measured-by-how-easily-it-reads.md
priority: medium
type: bug
ordinal: 684000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared shell geometry still describes the shell before the redesign: a 56px header, a 36px pane bar and a 41px agent bar under the panes. The shell now has one 40px row at the top of each column and nothing under the panes. The renderer reads the reference pane that this geometry derives, for the page shape it folds and wraps boards toward (track grid, block wraps) and for the fit that scores competing layouts (track score, block joins, packings, place and solves). So boards are laid out for a pane that the shell no longer draws. The redesign left the numbers alone because changing them moves layouts (ADR 0028, ADR 0039), and the shell-layout browser owner stopped holding the stage to them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The stage a lone pane draws on follows from the geometry the shell draws. The shell-layout browser owner measures the stage, the chrome row and the docked picture width at 1920 by 1080 and holds them to the constants.
- [x] #2 The constants for rows that no longer exist are gone and nothing names them. The height of the chrome row has one source that the stylesheet and the geometry share.
- [x] #3 The renderer lays boards out for a plain 1.4 page shape that no shell measurement changes. The renderer tests pass, and the notes say how many vault and example drawings move from the old 1272 by 899 pane.
- [x] #4 Every document that states the reference pane, other than ADR bodies, is true, and an ADR records the decision.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the stage and the pane the redesigned shell draws at 1920 by 1080, with the sidebar closed and open. 2. Replace HEADER_HEIGHT, PANE_BAR_HEIGHT and DOCK_BAR_HEIGHT in src/shared/shell-geometry with the one chrome row the shell draws, shared with the stylesheet. Derive STAGE and REFERENCE_PANE from it. 3. Put the stage and pane equality checks back into the shell-layout browser owner. 4. Run the renderer tests. For every layout expectation that moves, say why in the notes, with how many vault and example boards change their picture. 5. Correct the documents that state the reference pane. No board is affected: this changes constants and a test, not what a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision, 2026-10-05. The first attempt made the reference pane follow the shell (1599 by 1040 stage, 1271 by 992 pane). That moved 18 of 130 drawings and failed 7 renderer reading tests, so it was refused. The owner chose a plain aspect ratio, 1.4, kept near the old 1.415, so that a CSS row height can never again re-lay-out every board. The renderer now reads LAYOUT_ASPECT = 1.4 in track/grid.ts and blocks/wraps.ts, and takes the pane width from the shell (1271) and the height from the aspect. Measured by a scratch script over the vault boards, the web-shop example and six wide-board fixtures (130 drawings, both engines): at 1.4, 128 drawings are byte-identical to the old pane and 2 change, both in Browser application: the whole board (crossings 95 to 116) and Working with an agent (crossings 14 to 16). Neither breaks a reader invariant. Every renderer test passes with its old fixture. ADR 0043 records the decision, and ADR 0028 and 0039 carry a Superseded in part note. The shell facts are measured separately: stage 1599 by 1040 (the conversation resize handle keeps a 1px line), chrome row 40px from CHROME_HEIGHT through --shell-chrome-height. The shell-layout owner holds them. Not rerun by me: the impact script. I reran the renderer tests on the first attempt and got the same 7 failures the agent reported.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the shared shell geometry describe the shell as redesigned, with one source for the 40px chrome row, and decoupled the renderer page shape from it as a tuned 1.4 aspect ratio (ADR 0043). The shell-layout owner holds the stage, the chrome row and the docked picture width. Renderer tests pass unchanged, and 2 of 130 drawings move. Verified by all eight lanes of bun run check exiting 0 on the final branch.
<!-- SECTION:FINAL_SUMMARY:END -->
