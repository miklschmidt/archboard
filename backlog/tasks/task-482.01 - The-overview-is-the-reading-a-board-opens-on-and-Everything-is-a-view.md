---
id: TASK-482.01
title: 'The overview is the reading a board opens on, and Everything is a view'
status: To Do
assignee: []
created_date: '2026-10-15 21:05'
labels:
  - renderer
  - semantic-model
  - ui
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: feature
ordinal: 842000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board opened on its whole variant, which on most dogfood boards is too many lines to read (ADR 0052). The overview is derived, so every board gets it without authoring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A render that names no view draws the overview: root parts and the parts directly inside each root container, every deeper container closed as a card
- [ ] #2 A relationship to a hidden part is drawn to the closed card that holds it, all relationships from one drawn part to another are one line, a joined line has no label and takes the kind most of them have, and a relationship inside one closed card is not drawn
- [ ] #3 The overview draws no flows, and it shows comparison marks on a proposal
- [ ] #4 The view `Everything` draws every part and relationship, from the CLI, the HTTP route and the browser
- [ ] #5 A write that names a view `Overview` or `Everything` is refused
- [ ] #6 The browser opens a board on the overview, and the view list offers Overview, Everything and then the authored views
- [ ] #7 When the pane shows the overview, a walkthrough step that names no view is told through Everything
- [ ] #8 The archboard skill and CONTEXT.md say what the overview and Everything are
<!-- AC:END -->
