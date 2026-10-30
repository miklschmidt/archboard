---
id: TASK-556
title: A removed container keeps its header in a comparison
status: Done
assignee: []
created_date: '2026-10-29T23:13:00Z'
updated_date: '2026-10-29T23:48:00Z'
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
- [x] #1 A removed container in a comparison shows its header slab as a ghost, with the same box as in a plain picture
- [x] #2 A removed container still reads as removed: its frame keeps the dashed removed outline and its pin
- [x] #3 Plain pictures and the pictures of containers that are not removed are byte-identical to before
- [x] #4 Light and dark comparison pictures of a removed container are checked by eye
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The cause was that paint_measured_frame called tray(), and tray() returns nothing for a removed standing, so the header slab vanished. For a removed architecture container, paint_measured_frame in crates/archboard-scene/src/paint/measured_cards.rs now paints the measured header box with slab_shadow (Lift::Card): a half-opacity face and the dashed removed border, the same treatment as a removed card. Sequence frames keep tray(), so they are unchanged. Corpus run (all variants, both engines, both themes, comparison on and off): 45,756 drawings. 8,656 changed, and every one of them holds a removed container and keeps its size. The other 37,100 are byte-identical, including all 16,172 plain drawings. The native test a_removed_container_keeps_its_header_as_a_flat_ghost failed before the fix and passes after it. Checked by eye: TASK-373 Workbench reuse and TASK-367.27 Workspace packages, light and dark. bun run check is green on 09d251662.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
In a comparison picture, a removed container now keeps its header as a flat ghost with a dashed removed border, so a reader sees where the header ends. Its frame outline and pin are unchanged, and plain pictures stay byte-identical. Fixed in 09d251662 on feat/faster-first-render, which is merged into feat/blocks-layout.
<!-- SECTION:FINAL_SUMMARY:END -->
