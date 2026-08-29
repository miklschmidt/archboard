---
id: TASK-139
title: Present one canvas in fullscreen
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-29 16:19'
labels: []
dependencies: []
priority: medium
type: feature
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person presenting an architecture board needs a distraction-free view of one chosen canvas. The frontend should enter a presentation mode that hides the application shell and every other pane while preserving the live board session and making the selected canvas fill the available display.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can enter fullscreen presentation mode for the currently chosen canvas through a clear frontend control.
- [ ] #2 Presentation mode hides the shell, navigation, controls, and every non-selected canvas while the selected canvas fills the available display.
- [ ] #3 At most one canvas is presented at a time; choosing another canvas transfers presentation instead of creating a second fullscreen canvas.
- [ ] #4 Exiting presentation restores the prior shell and pane layout without losing the open boards, live connection, selection, or unsaved held state.
- [ ] #5 Keyboard and visible controls provide an accessible exit, and fullscreen refusal or loss returns to an accurate non-presenting state.
- [ ] #6 Rendered browser coverage proves enter, single-canvas exclusivity, transfer, exit, and state restoration through the user interface.
<!-- AC:END -->
