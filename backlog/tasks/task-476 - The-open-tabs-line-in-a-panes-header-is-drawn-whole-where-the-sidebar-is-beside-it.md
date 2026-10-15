---
id: TASK-476
title: >-
  The open tab's line in a pane's header is drawn whole where the sidebar is
  beside it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 15:03'
updated_date: '2026-10-15 15:04'
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
- [ ] #1 The open tab's line lies whole inside the pane header, on the header's rule, in both themes.
- [ ] #2 Where the sidebar is beside the header, docked or floating, no part of the line is drawn under it.
- [ ] #3 A browser test holds the line inside the header.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none is affected. The line moves inside the header, and no part, relationship or module changes.
2. PaneHeader.tsx: the open tab's line ends at the header's bottom edge, on the header's own rule. PageTab overrides the underline variant's after:-bottom-px! with after:bottom-0! under the same variant, so cn keeps only the override.
3. Test: shell-layout.test.ts reads the open tab's line and the pane header at 1920x1080 with the sidebar docked, and holds the line inside the header.
4. Look at it at 1920x1080 in both themes, with the sidebar docked and floating.
5. Close: bun run check together with TASK-477, and the code check's behind reading.
<!-- SECTION:PLAN:END -->
