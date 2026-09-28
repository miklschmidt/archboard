---
id: TASK-357
title: >-
  The presentation bar and the drill-down trail show the board's name, not its
  key
status: To Do
assignee: []
created_date: '2026-09-28 14:48'
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
- [ ] #1 The presentation bar names the board as the header does
- [ ] #2 The drill-down trail names each board as the header does
<!-- AC:END -->
