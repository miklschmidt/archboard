---
id: TASK-556
title: A removed container keeps its header in a comparison
status: To Do
assignee: []
created_date: '2026-10-29T23:13:00Z'
labels:
  - renderer
  - bug
dependencies: []
ordinal: 969000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In a comparison picture, a container whose standing is removed is painted as a flat ghost: crates/archboard-scene/src/paint/tray.rs and slab() in slab.rs return nothing for a removed standing, so the tray and the header slab both vanish. The title and subtitle then float on the ghost fill, and a reader cannot see where the header ends. In blind council 561 (TASK-554) a grader read lines that pass beside such headers as lines through them. Seen on Archboard, variants TASK-367.27 and TASK-373, views Workspace packages and Workbench reuse, in comparison. The same painter serves light and dark and both engines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A removed container in a comparison shows its header slab as a ghost, with the same box as in a plain picture
- [ ] #2 A removed container still reads as removed: its frame keeps the dashed removed outline and its pin
- [ ] #3 Plain pictures and the pictures of containers that are not removed are byte-identical to before
- [ ] #4 Light and dark comparison pictures of a removed container are checked by eye
<!-- AC:END -->
