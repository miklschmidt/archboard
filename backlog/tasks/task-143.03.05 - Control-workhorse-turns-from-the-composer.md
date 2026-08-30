---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-composer
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own submit, explicit steer, stop, and draft behavior in `src/ui/workbench-composer`. It renders controls from explicit capabilities and sends target-bound commands through the browser transport.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Submit starts an idle linked workhorse turn, Steer targets the named active turn only when permitted, and Stop interrupts the named active turn.
- [ ] #2 Disabled, editing, submitting, queued, steering, awaiting response, interrupted, completed, failed, reconnecting, and invalidated states are visibly distinct.
- [ ] #3 Recoverable failures preserve the draft; success clears it at the authoritative boundary; keyboard shortcuts and focus return cannot retarget after pane focus changes.
<!-- AC:END -->
