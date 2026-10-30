---
id: TASK-559.06
title: Show the right panel only for a selection, and move long lists to About
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.05
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 978000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The small right sidebar overwhelms the reader: the first screen spends itself on controls, adoption prose and tours. A permanent inspector also forces each pane to give up width, so the picture refits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The right panel is absent until a selection and opens as an overlay that does not refit the picture
- [ ] #2 A double click on a card at the right edge opens that card, because the panel and camera wait 220 ms
- [ ] #3 Connection rows are actions, and a joined line or door lists its real endpoints
- [ ] #4 The Key is one entry point, shows hidden kinds, and separates a mark from the control that hides it
- [ ] #5 About holds each long list and names which subject it describes
- [ ] #6 Warnings sit on their subject, and the owner accepts the result by eye
<!-- AC:END -->
