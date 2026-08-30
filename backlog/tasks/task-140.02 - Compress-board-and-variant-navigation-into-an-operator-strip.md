---
id: TASK-140.02
title: Compress board and variant navigation into an operator strip
status: To Do
assignee: []
created_date: '2026-08-30 02:30'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: medium
type: enhancement
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recompose the existing Board atlas as the compact left project strip in the approved reference. People should scan and switch among real boards, variants, drafts, and on-screen boards with less chrome and more room for the canvas. This is a presentation change over the existing board listing contract, not a thumbnail-generation system.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The strip presents every named board and variant from the existing listing and distinguishes current, on-screen, open, and draft state without inventing preview content
- [ ] #2 Selecting a board or variant still opens it into the focused pane, and busy, empty, loading, refresh-failure, scratch, and contextual naming states remain accurate and actionable
- [ ] #3 New board, refresh, and name-this-board actions remain available with accessible names, focus order, and touch targets
- [ ] #4 The strip uses less desktop width than the current Board atlas and adapts at 420 pixels without covering the canvas or hiding the current board
- [ ] #5 Rendered browser coverage proves navigation, focused-pane replacement, scratch naming, empty and failure states, and the desktop and narrow layouts
<!-- AC:END -->
