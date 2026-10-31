---
id: TASK-559.19
title: Keep the legend visible without a click
status: To Do
assignee: []
created_date: '2026-10-31T01:51:00Z'
updated_date: '2026-10-31T01:58:00Z'
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
The owner thought the legend was deleted, because the Key button at the lower left went unnoticed for hours. A legend has to be there without being asked for. The owner chose the right side, as on main: a permanent right column on every Diagram reading, with the legend at its foot. With nothing selected the column shows the open module's description, which also restores the description the edge tab removes from the picture. With a selection the subject stands above the legend. The owner also rejected the word Key, so the name goes back to Legend, the word main uses. Groups close the legend as bright tags in the look of the card tag, with no switch. On this repository 78 of 115 readings show a group, and the most is 5 on Commands. Mocks: /tmp/integrate/header-mockups/legend-right-a.png, legend-right-b.png and legend-groups.png. This replaces the overlay panel of TASK-559.06, which appeared only for a selection. The column costs about 360 px of picture width. The earlier complaint was that a small right sidebar overwhelmed readers, so it holds the legend and short text, and long lists stay in About.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The legend is visible without a click at the foot of a permanent right column on every Diagram reading at 1920 by 1080, and it lists the kinds, line types and groups of that reading
- [ ] #2 With nothing selected the column shows the open module's name and description, and with a selection it shows the subject above the legend
- [ ] #3 The way to hide kinds stays one control away, and it is visible
- [ ] #4 The picture fits inside the room the column leaves, and a selection never refits it
- [ ] #5 The whole legend stays on screen on every corpus reading, and a long subject scrolls above it
- [ ] #6 A group shows as a tag in both themes, in the look of the card tag, and the legend has no group switch
- [ ] #7 The name is Legend in the product, the code and the docs, and the word Key for this surface is gone
- [ ] #8 The bottom left button is gone, and so is any code that only served the overlay
- [ ] #9 The owner accepts it by eye
<!-- AC:END -->
