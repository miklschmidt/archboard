---
id: TASK-559.19
title: Keep the legend visible without a click
status: To Do
assignee: []
created_date: '2026-10-31T01:51:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.06
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 991000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner thought the legend was deleted, because the Key button at the lower left went unnoticed for hours. A legend has to be there without being asked for. The owner asked to try a thin always visible strip, mock /tmp/integrate/header-mockups/legend.png, and noted that the left column feels empty, so a place there is an open alternative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The legend is visible without a click on a reading at 1920 by 1080, and it lists the kinds and line types of that reading
- [ ] #2 The way to hide kinds stays one control away, and it is visible
- [ ] #3 The picture fits inside the room the legend leaves, and no selection or panel refits it
- [ ] #4 The legend holds one row on every corpus reading, or it states what it folds
- [ ] #5 The owner accepts it by eye
<!-- AC:END -->
