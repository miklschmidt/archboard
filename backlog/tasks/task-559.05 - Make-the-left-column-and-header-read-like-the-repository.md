---
id: TASK-559.05
title: Make the left column and header read like the repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-30T20:34:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.03
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 977000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The right sidebar owns navigation, and nothing shows where a module sits in the whole. The owner decided that navigation must read like the repository, and removed the numbered layers for that reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The left column follows the rule of the screen, with the `Modules`, `Flows`, `Walkthroughs` and `History` destinations
- [x] #2 The tree opens the active path, keeps the lit row in view while it scrolls, and sorts by code path with authored order for ties
- [x] #3 The tree follows the focused pane, and a second pane opens the chosen destination
- [x] #4 The header shows crumbs, the code path, the state chip and `Diagram | About`
- [x] #5 Every move has a keyboard route, including while presenting
- [ ] #6 operator-canvas-shell.md and CONTEXT.md describe the result, and the owner accepts it by eye
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged in 311616dae. The tree opens the active path and sorts by code path. The switcher lists checkouts. Flows, Walkthroughs and History stay open while the reader walks them. Moved off the first surface: bookmarks and former addresses to Find, comparison to History, Refresh to failures only. Open: the sidebar part list stays until TASK-559.06. Criterion 6 waits for the owner by eye. The architecture model does not yet record the new tree export or the column.
<!-- SECTION:NOTES:END -->
