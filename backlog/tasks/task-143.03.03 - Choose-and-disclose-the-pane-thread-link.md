---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-thread-link
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the current-epoch thread picker and thread-link disclosure in `src/ui/workbench-thread-link`. It accepts closed rows/capabilities and emits explicit create, attach, inspect, and rebind commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The picker shows dedicated-home sign-in, fresh and same-child-reconnected threads, and disabled exact reasons for systemError, direct-input false/null, notLoaded, ownership unknown, prior epoch, and child exit.
- [ ] #2 Only a proven current loaded controllable row offers create/link input; inspect-only rows have no hidden keyboard, pointer, or command path to mutation.
- [ ] #3 The disclosure names pane, workhorse, child/epoch status, coordinator link when present, and every active-work guard that blocks close or rebind.
- [ ] #4 Keyboard, focus return, screen-reader naming, light/dark, desktop pointer, and Samsung Flip touch behavior are verified in the module browser owner.
<!-- AC:END -->
