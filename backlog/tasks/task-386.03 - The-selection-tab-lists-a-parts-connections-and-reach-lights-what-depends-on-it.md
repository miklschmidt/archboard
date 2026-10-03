---
id: TASK-386.03
title: >-
  The selection tab lists a part's connections, and reach lights what depends on
  it
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
updated_date: '2026-10-03 16:04'
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
The selection tab already lists a picked part's relationships as Sends to and Receives from, and a click on a row picks the part at the other end (DetailsPanel, brought in with the prototype picks). Three things are missing. Pointing at a row does not show where its line runs on the picture. Following a row can leave the part it picks out of view, because only a panel laid over the picture ever moves the camera. And nothing answers the question that comes after "what is it wired to": how far does a change to it reach? The first two make the list and the picture one thing, and a person can walk the architecture from either. The third is a wave across the picture that shows its depth at a glance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pointing at or focusing a relationship row in the selection tab lights that relationship and its two parts on the picture, as lightly as a resting pointer does
- [ ] #2 Choosing a row picks the part at the other end and moves the camera once, just far enough to show both parts when they are not both in view, and moves nothing when they are
- [ ] #3 Two controls light everything the part depends on, or everything that depends on it, hop by hop with the nearest strongest, and each says how many parts that is
- [ ] #4 Every new control is reachable from the keyboard, has an accessible name and state, and honors reduced motion
- [ ] #5 A sequence view keeps the selection tab it has
<!-- AC:END -->
