---
id: TASK-357
title: >-
  The presentation bar and the drill-down trail show the board's name, not its
  key
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 14:48'
updated_date: '2026-10-11 14:01'
labels:
  - ui
dependencies: []
priority: low
type: bug
ordinal: 598000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 in README footage. Presented fullscreen, the bar reads 'Pane A · web shop' and 'Pane A · renderer layout'; after a drill-down the trail reads '‹ web shop   web shop › Inventory service' while the header breadcrumb reads 'Web shop › Inventory service'. PresentationBar.tsx renders pane.status.board.board and SemanticTrail.tsx renders stop.board, the key the pane was opened with; PaneBar.tsx already looks the display name up through paneBoardName.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The presentation bar names the board as the header does
- [x] #2 The drill-down trail names each board as the header does
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. PresentationBar shows pane.status.board.board (the key). Show the display name the header shows instead.
2. Find the cheapest source of the name available to the shell; add a test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC2 (the drill-down trail) was already delivered by fc174117a: use-drill-places.ts names each stop from the board's document. The audit found the task text out of date (SemanticTrail.tsx and PaneBar.tsx were deleted in 10c8ceea5; the trail and the header are one breadcrumb in PaneHeader). AC1: PresentationBar printed pane.status.board.board, the key as typed. ShellPane now carries boardName, looked up in the listing by shell-view.ts, and the bar prints it. Evidence: presentation-bar.test.tsx (red without the change), shell-view.test.ts, and the trail case in semantic-board-inspection.test.tsx now uses a document named 'Pipeline Board' under key 'pipeline' and asserts the crumb shows the name.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The presentation bar and the drill-down trail now name the board as the header does. The trail already did (fc174117a); the bar printed the key as typed, so a link spelling 'web shop' showed that instead of 'Web shop'. ShellPane gained boardName, resolved from the board listing in shell-view.ts, and the bar prints it before the reported key. Verified: presentation-bar.test.tsx (fails without the change), shell-view.test.ts, and the trail assertion in semantic-board-inspection.test.tsx, which now uses a board whose name differs from its key.
<!-- SECTION:FINAL_SUMMARY:END -->
