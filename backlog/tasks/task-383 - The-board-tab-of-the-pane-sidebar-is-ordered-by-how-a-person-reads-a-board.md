---
id: TASK-383
title: The board tab of the pane sidebar is ordered by how a person reads a board
status: To Do
assignee: []
created_date: '2026-09-30 18:51'
labels:
  - ui
dependencies: []
priority: high
type: enhancement
ordinal: 662000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-09-30: the board details sidebar (the Board tab of the pane sidebar, TASK-249) needs a lot of attention to detail. Its sections (views, walkthroughs, groups, variants, legend, engine) are stacked without a hierarchy that follows what a person comes to the tab for, so the tab does not guide a first read or a return visit. The hierarchy must come from research into the use cases and into how a human reads a board, done before any redesign. docs/design/operator-canvas-shell.md, section "The pane sidebar", is the current visual authority and must be revised with the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before the redesign, a written study names the tasks a person brings to the board tab, the order in which a person reads a board, and which element of the tab serves each task; the task notes link it
- [ ] #2 The board tab orders and weights its sections by that study: position, heading, spacing and type role show each section's rank, and nothing on the tab lacks a task it serves
- [ ] #3 Every section of the tab shares one alignment grid, one spacing scale and the shell type roles, in the light and the dark theme at 1920×1080
- [ ] #4 Rendered captures of the tab before and after, in both themes, on the dogfood vault, replace the sidebar image in docs/design/assets and the pane sidebar section describes the new hierarchy
- [ ] #5 bun run check passes
<!-- AC:END -->
