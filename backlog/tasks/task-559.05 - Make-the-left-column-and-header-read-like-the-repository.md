---
id: TASK-559.05
title: Make the left column and header read like the repository
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.03
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 977000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The right sidebar owns navigation, and nothing shows where a module sits in the whole. The owner decided that navigation must read like the repository, and removed the numbered layers for that reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The left column follows the rule of the screen, with the `Modules`, `Flows`, `Walkthroughs` and `History` destinations
- [ ] #2 The tree opens the active path, keeps the lit row in view while it scrolls, and sorts by code path with authored order for ties
- [ ] #3 The tree follows the focused pane, and a second pane opens the chosen destination
- [ ] #4 The header shows crumbs, the code path, the state chip and `Diagram | About`
- [ ] #5 Every move has a keyboard route, including while presenting
- [ ] #6 operator-canvas-shell.md and CONTEXT.md describe the result, and the owner accepts it by eye
<!-- AC:END -->
