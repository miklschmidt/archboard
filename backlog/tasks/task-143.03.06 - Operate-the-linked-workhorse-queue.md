---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-143.07.02
  - TASK-144.19
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-queue
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Archboard queue presentation and commands in `src/ui/workbench-queue`. This is owned source, not an assistant-ui Element; it consumes the exhaustive server snapshot and emits only legal add/edit/cancel/reorder/start commands.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty, loading, running, queued, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, and unavailable states show ownership, request/turn correlations, and recovery without copying timeline content.
- [ ] #2 Reorder submits all IDs and moves only coordinator-owned entries while preserving foreign/unowned relative order; attached-busy, stale, pending, and failed actions explain why they are disabled.
- [ ] #3 No optimistic terminal/reorder state is committed; confirmation, server refusal, outcome_unknown, reconnect, and retry remain explicit.
- [ ] #4 Tests at src/ui/workbench-queue/tests cover every state/action, keyboard/pointer reorder, focus, labels/status, stale snapshots, errors, and exact cross-links.
<!-- AC:END -->
