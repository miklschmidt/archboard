---
id: TASK-386.03
title: >-
  The selection tab lists a part's connections, and reach lights what depends on
  it
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 673000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lighting shows where the lines of a part run, but not what they say, and nobody can walk the picture from the keyboard. The selection tab says what a part is and not what it is wired to. Two questions follow a pick: what is this part wired to, and how far does a change to it reach? The first is a list a reader can read and follow. The second is a wave across the picture that shows its depth at a glance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The selection tab lists the relationships of a picked part as Calls and Called by, each row naming the other part and the relationship's label
- [ ] #2 Pointing at or focusing a row lights that relationship on the picture, and activating it picks the other part and moves the camera just far enough to show both
- [ ] #3 Two controls light everything the part depends on, or everything that depends on it, hop by hop with the nearest strongest, and each shows how many parts that is
- [ ] #4 Every control is reachable from the keyboard, has an accessible name and state, and honors reduced motion
- [ ] #5 A sequence view keeps the selection tab it has
<!-- AC:END -->
