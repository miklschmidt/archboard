---
id: TASK-386
title: >-
  A board can be explored by hand: it moves smoothly, answers a poke and opens
  into what is inside
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-03 15:13'
updated_date: '2026-10-03 15:40'
labels:
  - frontend
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md
  - DESIGN.md
priority: high
type: feature
ordinal: 670000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An architect who did not draw a system learns it by poking at the picture, and today the picture does not answer. Measured on 2026-10-03 on the densest board in the vault, Archboard server (4028 by 3011 units, 23 parts, 52 relationships, drawn at 0.45 of its size when it fits the pane): picking a part draws a ring around it and changes nothing else, so its relationships stay among 50 others of the same weight. Every wheel event zooms by a fixed 10 percent, whatever the wheel did, and a drag stops dead when it is released. Opening a card's board cuts to a new picture: the old one grows 14 percent and fades while the new one assembles, so the reader does not see that the new board lies inside the card they chose.

The subtasks fix these one at a time and keep every constraint of the viewer. The browser reads and writes no board content (ADR 0023). All motion runs on the frame clock, so a recording renders the same frames from the same talk (ADR 0041). Nobody moves a box.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No frame loop runs on an idle page, and a camera move still re-renders only the board surface (TASK-385)
- [ ] #2 Every new motion honors the reduced-motion preference and runs on the frame clock
- [ ] #3 semantic render and semantic rasterize write the same bytes as before
- [ ] #4 Each subtask is seen working in the browser at 1920x1080 on Archboard server, in both themes
<!-- AC:END -->
