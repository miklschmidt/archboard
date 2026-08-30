---
id: TASK-140.03
title: Move agent claim and progress into a collapsible workbench
status: To Do
assignee: []
created_date: '2026-08-30 02:30'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: enhancement
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the permanent right Agent activity rail with the bottom workbench composition from the approved reference. The workbench must present the focused pane real connection, claim, and doing state while giving the canvas more horizontal room. It controls only behavior Archboard already owns, including Take back control; it does not add Pause, Send, a prompt box, or a hidden proposed-diff flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The workbench can be expanded and collapsed and shows the focused pane Ready, Working, or Offline state, active claim reason, latest doing entry, and recent doing history from existing live data
- [ ] #2 Take back control remains available during an active agent claim and has the same immediate board-release behavior and human-authority guarantee as the current control
- [ ] #3 Empty history, active claim, progress updates, disconnect, reconnect, release, and take-back states are accurate, inspectable, and announced accessibly
- [ ] #4 The workbench does not cover Excalidraw controls, remains associated with the focused pane in a two-pane layout, yields the canvas the larger region, and stays hidden in fullscreen presentation
- [ ] #5 Rendered browser coverage proves collapse and restore, focused-pane transfer, live progress, disconnect and recovery, claim and take-back, and desktop and 420 pixel layouts
<!-- AC:END -->
