---
id: TASK-302.03
title: A navigator that stays navigable at 200 boards
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
labels: []
dependencies:
  - TASK-302.01
parent_task_id: TASK-302
priority: high
ordinal: 525000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The navigator lists every board A-Z with at least two rows each (board, then a repeated variant row), no search, all expanded, activity only on variant rows, and a BOARDS eyebrow. At 14 boards it already scrolls; at 200 it is unusable. The redesign derives an outline from folders, the drill hierarchy and names, lists each board once, shows variant states only for the board being read, filters in place, and gathers live agent work into one block that never reflows the tree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each board appears on exactly one row of fixed height; the outline nests boards under folders and under their primary drill parent, and siblings sort by name; activity never reorders or resizes rows
- [ ] #2 A row shows the board name, its level as a muted word, which panes show it, whether an agent works on it, and how many other states it has
- [ ] #3 The variant ancestry of the board in the active pane is listed under its row, and any other board's states open from its row; choosing one opens it
- [ ] #4 A filter reachable by / and Ctrl+K narrows the outline in place in tree order by name, folder, variant and description, with a count and a clear control
- [ ] #5 Enter or a click opens into the active pane and Alt+Enter or Alt+click into the other pane (adding pane B when there is one pane), each as the person's own move (ADR 0034)
- [ ] #6 Boards an agent is claiming or recently wrote are gathered in a working-now block with the latest doing line and its age, absent when nothing is live
- [ ] #7 Loading, empty, unreadable-listing and offline states are drawn; there are no eyebrows
<!-- AC:END -->
