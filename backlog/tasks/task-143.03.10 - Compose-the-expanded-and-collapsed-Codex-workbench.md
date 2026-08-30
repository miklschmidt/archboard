---
id: TASK-143.03.10
title: Compose the expanded and collapsed Codex workbench
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.03
  - TASK-143.03.04
  - TASK-143.03.05
  - TASK-143.03.06
  - TASK-143.03.07
  - TASK-143.03.08
  - TASK-143.03.09
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-frame
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the canvas-first layout and composition API in `src/ui/workbench-frame`. It arranges thread-link status, workhorse timeline, optional coordinator, queue, approvals, composer, and board status without owning their state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Expanded layout has compact thread-link/status header, workhorse-first timeline, optional coordinator disclosure, queue/approval region, composer/turn controls, and separate board-status region.
- [ ] #2 Collapsed layout keeps connection, workhorse running/idle, pending approval/queue count, voice status, and Take back control visible without obscuring the canvas.
- [ ] #3 Supported desktop one-pane, two-pane, fullscreen, light/dark, keyboard, reduced-motion, screen-reader log, and Samsung Flip touch layouts follow the TASK-140 operator shell with flat rules, small radii, cobalt/lime semantics, and no generic chat bubbles/cards/gradients/glow.
<!-- AC:END -->
