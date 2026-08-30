---
id: TASK-143.04.10
title: Keep live voice Stop reachable in fullscreen
status: To Do
assignee: []
created_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.04.06
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/fullscreen-presentation
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the fullscreen-shell projection for an active voice session in `src/ui/shell/fullscreen-presentation`. Because presentation fullscreen hides the workbench frame, expose only bound voice status and Stop through the existing fullscreen control region; all other voice UI remains in the workbench.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inactive voice leaves fullscreen behavior byte-for-byte unchanged; active voice shows coordinator/thread-link identity, concise phase, mute status, and one reachable Stop action.
- [ ] #2 Stop remains keyboard-, pointer-, touch-, and screen-reader-operable without revealing composer, queue, approvals, or a second state owner in fullscreen.
- [ ] #3 Tests at src/ui/shell/tests/fullscreen-presentation.test.ts cover active/stopping/failure/closed transitions, focus return, Escape/fullscreen exit, one/two panes, both themes, and Samsung Flip touch.
<!-- AC:END -->
