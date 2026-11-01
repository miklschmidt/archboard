---
id: TASK-559.34
title: Polish the far view of a card
status: To Do
assignee: []
created_date: '2026-10-31T20:03:00Z'
updated_date: '2026-11-01T02:08:00Z'
labels: []
dependencies: []
parent_task_id: TASK-559
ordinal: 1006000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner, on 2026-10-31: the far view reads messy, crammed and busy next to the near view. Words are too large for the box, it holds a description line too many, and the group tag looks like a button and spoils the path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A far card reads with the same anatomy as a near card
- [x] #2 A far card holds one description line less than it can
- [x] #3 The far tag does not look like a button and leaves the path whole
- [ ] #4 The owner accepts it by eye
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A far card has the build of a near card. Name at the top, path at the foot. It holds one line less of its responsibility than its box holds, and keeps a last line where half a line of air stands round it. The far scale no longer starts at a name of 20 units: it starts at 16, and it is 12 px at the landing. A group shows as a flat spot at the top right, so the path keeps its whole room. Waiting for the owner's eye.

Far view redone after owner review. The far scale no longer follows where a picture lands, because that reached 2.09 times the near size on low readings. Every far card now uses one fixed scale, a name of 18 units, with its near padding on all sides. The chip stays in its near place at its near size, so only the words move between the views. At 111 of 112 readings the scale is exactly 18 units. Codex session is a hair lower because one box limits it. Workspace packages at fit 0.29 now draws names at about 5 px. Owner review of Tracks found four routing faults on Archboard server: a crossing with no bridge, a detour, a kink with two dots, and dead space in a frame. Tracks is known to have defects, so the owner dropped them.

After owner review: a far card shows one line more than the previous build, which is what its box holds. Doors now count the way round a frame between them and what they join, a two-way line shares its trunk's ink, the reader panel heading uses title-name, and the light picture uses warm neutrals. Still open for the owner: a better drawing of mixed relationships and its legend sample, and whether the container grid stays.

Paint batch: a mixed line is a double line and the legend shows it. Far view thickens lines and arrowheads by FAR_SCALE. Cards have a gradient, a top highlight and a downward shadow in both themes; light neutrals stand off the floor. Wells show top and side walls with the tabs. Doors and tags use white tinted ink in light. The door separator is a shade of the door. Rim bands merge with corners. Gate 21 of 21. Grid compaction remains open on feat/grid-compaction.

Well and tab repair: a well's walls thin round each corner into the next, and the line round the well replaces the crease. A proposal's six tabs hold one row, with Previous, Next and the position in the reading header. A tab's side turns into the well's edge with no Y at its foot. New flake seen once: model-measures.test.tsx, React work scheduled after teardown.

Header and panel repair: the caption line is gone. The comparison control and Clear focus stand in the header. The panel heads a flow with its name, its collection and the representation switch. Standing blocks keep the panel's margin. The Migration baseline repeats names because it holds one module per old board, 656 modules, with 8 named Archboard server: exact retained data, left unchanged.
<!-- SECTION:NOTES:END -->
