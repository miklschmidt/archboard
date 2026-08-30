---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.07.02
  - TASK-143.03.01
  - TASK-144
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
Own queue presentation and user commands in `src/ui/workbench-queue`. It consumes the exhaustive server snapshot and exposes only add/edit/cancel/reorder/start actions that the runtime says are legal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Server order, ownership, originating coordinator request, resulting turn, and running/queued/interrupted/blocked/failed/restarted/completed states are visible without duplicating timeline content.
- [ ] #2 Reorder submits all IDs and allows only coordinator-owned entries to move while preserving foreign/unowned relative order; disabled attached-busy or stale actions explain why.
- [ ] #3 Keyboard/pointer controls, confirmation, optimistic-state refusal, stale snapshots, error recovery, and exact cross-links are covered by module and browser tests.
<!-- AC:END -->
