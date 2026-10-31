---
id: TASK-559.25
title: Give every line on a shared trunk its label back
status: To Do
assignee: []
created_date: '2026-10-31T03:37:00Z'
labels:
  - renderer
  - board
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 997000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The door work made lines to one door share a trunk from three lines upward, and those lines draw no words. That departs from criterion 2 of TASK-559.14, and the owner noticed that a whole lot of labels are gone. 298 of 1,722 lines lost their label across 39 readings: 24 of 39 on Commands, 18 of 40 on Workhorses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every line with a label shows it in the picture: BUS_LINES no longer removes words
- [ ] #2 A line that joins a trunk wears its label on its own branch, near the part that owns it, before the join
- [ ] #3 A reader can tell which words belong to which part on Commands and Workhorses
- [ ] #4 Gates 1 to 4 are measured again, no drawing passes 500 ms, and any change is stated
- [ ] #5 The owner accepts it by eye
<!-- AC:END -->
