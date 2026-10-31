---
id: TASK-559.34
title: Polish the far view of a card
status: To Do
assignee: []
created_date: '2026-10-31T20:03:00Z'
updated_date: '2026-10-31T23:59:00Z'
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
<!-- SECTION:NOTES:END -->
