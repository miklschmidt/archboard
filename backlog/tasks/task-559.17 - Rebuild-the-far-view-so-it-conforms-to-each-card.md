---
id: TASK-559.17
title: Rebuild the far view so it conforms to each card
status: To Do
assignee: []
created_date: '2026-10-31T00:14:00Z'
labels:
  - renderer
  - frontend
dependencies:
  - TASK-559.16
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 989000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner said that most far views look very bad and do not conform to the card sizes. The far view starts below camera scale 12/14 (0.857), so every picture fitted below that scale opens in it, which makes it the normal view of a large reading. A far card draws a 52 px tile, a name of 15 to 20 px, a path of 15 px and up to 8 lines of responsibility inside a box that the layout sized for the near view, so words truncate or leave empty bands. A group tag, a door button, the edge tab and the shared grid all arrive before this task and must read at far scale.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A far card fits the box it stands in at every size that the corpus produces, with no truncated middle of a word, no empty band and no overflow
- [ ] #2 Name, group tag and kind stay readable at the lowest scale a reading lands at, and a door and an edge tab keep their look and arrow
- [ ] #3 Cards of one picture share one far type scale, so that neighbours do not differ by chance
- [ ] #4 The swap between near and far keeps its transition, and a card keeps its place across it
- [ ] #5 Screenshots of the corpus readings at their landing scale pass Gate 6 in the real pane
- [ ] #6 The owner sees the far view of the root, Browser, Workspace packages and Commands and accepts it by eye
<!-- AC:END -->
