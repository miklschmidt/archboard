---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:50'
labels: []
dependencies:
  - TASK-143.01.11
  - TASK-143.03.01
  - TASK-144.07
  - TASK-144.14
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
Own the current-epoch thread picker and thread-link disclosure in `src/ui/workbench-thread-link`. This is Archboard-owned Base UI/Tailwind source, not a copied assistant-ui Element; it accepts closed rows/capabilities and emits explicit create, attach, inspect, and rebind commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty, signing-in, login-cancelled/failed, loading, fresh, same-child-reconnected, and failed discovery are visible; systemError, canAcceptDirectInput false/null, notLoaded, ownership unknown, prior epoch, and child exit show exact disabled reasons.
- [ ] #2 Dedicated-home sign-in/cancel emits the account command; only a proven current loaded controllable row can create/link, and inspect-only rows expose no keyboard, pointer, form, or command path to mutation.
- [ ] #3 Disclosure names pane, workhorse, child/epoch, coordinator when present, and every active-work guard blocking close/rebind; create uses TASK-143.01.11 and partial failure is actionable.
- [ ] #4 Module tests at src/ui/workbench-thread-link/tests cover the complete account/discovery/link matrix, keyboard, focus return, screen-reader labels/status, light/dark, desktop pointer, reduced motion, and Samsung Flip touch.
<!-- AC:END -->
