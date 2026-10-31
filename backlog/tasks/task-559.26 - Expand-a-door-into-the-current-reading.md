---
id: TASK-559.26
title: Expand a door into the current reading
status: To Do
assignee: []
created_date: '2026-10-31T03:49:00Z'
labels:
  - frontend
  - board
  - renderer
dependencies:
  - TASK-559.22
  - TASK-559.16
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 998000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants two actions on a door: navigate, which opens that module, and expand, which brings the module into the current view and so widens the scope. Decision: expand opens the door's module as a second open frame in the same picture, with its parts, and lines between the two frames run part to part. The door is gone while it is expanded. A reading stays content free, so the address holds what is expanded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A door offers navigate and expand as two visible actions, by pointer and keyboard
- [ ] #2 Expand draws that module as an open frame with its parts in the same picture, and lines to it end on its parts
- [ ] #3 The expanded frame's tab offers collapse, which brings the door back
- [ ] #4 Expanding repeats, and the address holds it, so a reload, a shared link and a pane keep the reading
- [ ] #5 The picture keeps its transitions, lands whole, and stays under 500 ms on the readings the owner names
- [ ] #6 The owner accepts it by eye
<!-- AC:END -->
