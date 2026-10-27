---
id: TASK-548.11
title: >-
  A parent's header is a card sized to its content, set slightly stronger than a
  regular card
status: To Do
assignee: []
created_date: '2026-10-27T04:28:00Z'
labels:
  - renderer
  - layout
dependencies: []
parent_task_id: TASK-548
type: enhancement
ordinal: 965000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a parent's header (the card that names a parent at the top of its frame) spans the frame's full width. Every line that leaves or enters the frame from above must then cross it, which is a defect, or detour around the frame, which reads worse (council round 2 of TASK-548.08: 92 header crossings before, and long detours after). The owner decided on 2026-10-27: a header uses normal card sizing, as wide as its content, and its text and icon are set slightly stronger than a regular card's, so it still reads as the parent's name. Lines can then pass beside it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A parent's header is as wide as a regular card with the same text, not the frame's width, in both engines and every theme
- [ ] #2 A header's name and icon are set slightly stronger than a regular card's, and a reader can still tell the header from the parent's members
- [ ] #3 No line crosses a header, and the hard header checks in expectDrawingIntact pass
- [ ] #4 The grading council judges the changed drawings to read as well or better
<!-- AC:END -->
