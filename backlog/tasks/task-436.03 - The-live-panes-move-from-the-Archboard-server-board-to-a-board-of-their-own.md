---
id: TASK-436.03
title: The live panes move from the Archboard server board to a board of their own
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - dogfood
dependencies: []
parent_task_id: TASK-436
ordinal: 697000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Archboard server board is too large to read, and its first layout takes about 2.1 s on Track and 11 s on Blocks, against a budget of 1 s. Each new relationship made the layout slower, so TASK-367.28 drew 16 dependencies only as steps of flows in three data-flow views. The owner decided to split the board and to show what moves out as cards that drill down to the new board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The parts of the live panes (Pane routes, Pane socket, Pane registry, Board announcements, Change feed, Tab session presence and Disk change watcher) are on a board of their own, and the Archboard server board shows them as one or more cards that drill down to it
- [ ] #2 Each dependency that TASK-367.28 drew only as a flow step is a relationship with an anchor on the board that contains both of its ends
- [ ] #3 The notes give the first layout time of both boards on Track and on Blocks
- [ ] #4 `./bin/dogfood check` reports no diagnostics, and `./bin/dogfood check --code` reports no new warning
<!-- AC:END -->
