---
id: TASK-143.03.10
title: Compose the expanded and collapsed Codex workbench
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 18:00'
labels: []
dependencies:
  - TASK-143.03.02
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
Compose expanded/collapsed workbench layout, app-global request surface, and responsive pane behavior. Delegation profile: gpt-5.6-sol, xhigh because this is substantial UI design governed by the reference mockup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Expanded and collapsed layouts preserve workhorse-first hierarchy, separate coordinator history/settings, queue, approval, board claim/doing, and exact source-pane labels at one/two-pane desktop and Flip sizes.
- [ ] #2 A lease-owned app-global approval/input request remains visible and actionable when another pane is focused or navigation changes; its immutable source is shown and no action retargets it.
- [ ] #3 Keyboard order, focus transitions, screen-reader landmarks, reduced motion, light/dark/high-contrast, 44px touch targets, overflow, and empty/loading/error states follow the aesthetic contract.
- [ ] #4 The frame consumes module ports only and owns no process/session/timeline/queue/approval/coordinator state.
- [ ] #5 Frame module tests prove one/two-pane, collapsed, fullscreen, app-global request visibility, captured-source routing, focus order, and empty/loading/error projections; TASK-143.03.13 owns rendered browser coverage.
<!-- AC:END -->
