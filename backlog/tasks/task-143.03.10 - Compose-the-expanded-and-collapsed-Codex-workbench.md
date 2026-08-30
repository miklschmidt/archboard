---
id: TASK-143.03.10
title: Compose the expanded and collapsed Codex workbench
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.03
  - TASK-143.03.04
  - TASK-143.03.05
  - TASK-143.03.06
  - TASK-143.03.07
  - TASK-143.03.08
  - TASK-143.03.09
  - TASK-144.14
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
Own canvas-first text-workbench composition in `src/ui/workbench-frame`. It arranges thread link, workhorse timeline, optional coordinator, queue, approvals, composer, and board status, and reserves one inert optional voice slot without importing or presenting voice state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Expanded text layout has a compact link/status header, workhorse-first timeline, optional coordinator disclosure, queue/approval region, composer/turn controls, and separate board status.
- [ ] #2 Collapsed text layout keeps connection, running/idle, pending approval/queue count, and Take back control visible; the inert absent voice slot renders nothing and has no status claim.
- [ ] #3 Empty/loading/partial/failure/recovery states preserve reachable Stop and recovery actions without hiding the canvas or overlapping fullscreen controls.
- [ ] #4 Tests at src/ui/workbench-frame/tests cover desktop one/two panes, fullscreen, collapse, light/dark, keyboard, reduced motion, screen-reader log order, and Samsung Flip touch under TASK-140 aesthetics.
<!-- AC:END -->
