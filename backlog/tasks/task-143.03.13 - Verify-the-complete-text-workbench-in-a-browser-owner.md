---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
labels: []
dependencies:
  - TASK-143.03.03
  - TASK-143.03.04
  - TASK-143.03.05
  - TASK-143.03.06
  - TASK-143.03.07
  - TASK-143.03.08
  - TASK-143.03.09
  - TASK-143.03.11
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/codex-workbench.test.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the deterministic serial-browser test for the complete text workbench at `tests/system/browser/codex-workbench.test.ts`. It consumes public browser/server seams and controlled Codex fixtures; it does not add application behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner reaches empty, signing-in, loading, linked, running, queued, approval-blocked, coordinator, reconnecting, invalidated, completed, and recoverable and terminal failure states through public commands and events.
- [ ] #2 It verifies keyboard and touch actions, focus return, batched status announcements, light/dark, one/two panes, collapse/expand, fullscreen, and unchanged Excalidraw interaction.
- [ ] #3 Every visible action is asserted against the exact pane, thread link, turn, request, or queue identity and inspect-only states have no mutation path.
- [ ] #4 The test cleans every browser, server, child, dedicated home, and pending request resource and is ready for separate canonical browser-lane registration.
<!-- AC:END -->
