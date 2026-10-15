---
id: TASK-476
title: >-
  The open tab's line in a pane's header is drawn whole where the sidebar is
  beside it
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:03'
updated_date: '2026-10-15 16:04'
labels: []
dependencies: []
references:
  - src/ui/semantic-board-canvas/components/PaneHeader.tsx
  - src/ui/components/tabs.tsx
  - src/ui/semantic-board-canvas/components/SemanticSidebar.tsx
priority: medium
type: bug
ordinal: 839000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-15 the owner reported, with a screenshot, that the pane sidebar covers part of the gold line under the open tab. Since TASK-475 the header has two tabs, so at 1920x1080 the Diagram tab sits above the inner edge of a docked sidebar. The shared underline tabs draw the line 2px tall, with its lower pixel 1px below the tab, on the rule of the tab list. In the pane header the rule is the header's own last pixel row, so the lower pixel lies below the header. The sidebar column starts at the header's bottom edge and is drawn after the header at the same z-index (z-30), so it paints over that pixel. Measured at 1920x1080: the header spans y 0 to 40, the line y 39 to 41, and the sidebar column starts at y 40 and x 1640, under the tab at x 1607 to 1696.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The open tab's line lies whole inside the pane header, on the header's rule, in both themes.
- [x] #2 Where the sidebar is beside the header, docked or floating, no part of the line is drawn under it.
- [x] #3 A browser test holds the line inside the header.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none is affected. The line moves inside the header, and no part, relationship or module changes.
2. PaneHeader.tsx: the open tab's line ends at the header's bottom edge, on the header's own rule. PageTab overrides the underline variant's after:-bottom-px! with after:bottom-0! under the same variant, so cn keeps only the override.
3. Test: shell-layout.test.ts reads the open tab's line and the pane header at 1920x1080 with the sidebar docked, and holds the line inside the header.
4. Look at it at 1920x1080 in both themes, with the sidebar docked and floating.
5. Close: bun run check together with TASK-477, and the code check's behind reading.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: the shared underline tabs draw the open tab's 2px line with bottom -1px, so its lower pixel sits on a tab list's own rule. The pane header's tab list has no rule: the header draws its rule in its own last row. So the lower pixel lay 1px below the header, at y 40 to 41, where the sidebar's column starts. The column is z-30, as the header is, and comes after it, so it painted over that pixel where the Diagram tab sits above it (x 1640 to 1696 at 1920x1080).

Fix in e20dc563f: PageTab ends the line at the header's edge, with after:bottom-0! under the underline variant, which cn merges in place of the primitive's -bottom-px!. The line now spans y 38 to 40, on the header's rule. The shared primitive is unchanged, so the sidebar's Board and Selection tabs keep their line on their tab list's rule.

Test: shell-layout.test.ts reads how far the line reaches below the header with the sidebar docked (tabLineBelowHeader in support/shell-dom.ts), and holds it to 0. Without the fix it fails with 1. The read lives in the support file because the test file has a 500-line limit.

Looked at at 1920x1080: one pane with the sidebar docked in the light and the dark theme, and two panes with pane A's sidebar floating under its open tab. The line is whole in each.

Gate: bun run check passed in full on 961499229, the last commit of both tasks, from 17:53 to 18:03: lint, format, types, the frontend build, 4720 module tests with 1 skipped, 240 system tests, 27 repository tests and the 19 browser files.

Boards: none is affected, as planned. The code check's behind reading names Board viewer: 2 commits since 6aa9accce, through Semantic viewer and Render stage states. They are e20dc563f of this task and c1c61bfa1 of TASK-477. e20dc563f changes only where the open tab's line ends inside the pane header, so the words of both parts stay true. The code check, run on a private server, finds the same 20 findings as at the close of TASK-475.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The open tab's line in a pane's header now ends at the header's edge, on the header's own rule, so the sidebar's column no longer covers its lower pixel (e20dc563f). PageTab overrides the shared underline's -bottom-px with bottom-0 under the same variant, and the shared tabs elsewhere keep their line. Verified by shell-layout.test.ts, which reads the line 1px below the header without the fix and 0 with it, by 1920x1080 screenshots in both themes with the sidebar docked and floating, and by bun run check on 961499229.
<!-- SECTION:FINAL_SUMMARY:END -->
