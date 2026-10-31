---
id: TASK-559.34
title: Polish the far view of a card
status: To Do
assignee: []
created_date: '2026-10-31T20:03:00Z'
updated_date: '2026-10-31T20:39:00Z'
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
<!-- SECTION:NOTES:END -->
