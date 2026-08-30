---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-queue
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own exhaustive workhorse queue observation and mutation in `src/runtime/codex-workhorse-queue`. It preserves server order and applies only to the coordinator-bound workhorse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Queue list exhausts every cursor; add/edit/cancel/reorder/start use exact generated contracts and return stable correlations to coordinator requests and workhorse turns.
- [ ] #2 Queueing is allowed only for an Archboard-created workhorse whose persisted developer instructions and dynamic-tool manifest match; attached busy work is never silently queued.
- [ ] #3 Reorder sends every submission ID, changes only coordinator-owned entries, and preserves foreign or otherwise unowned entries and their relative order.
- [ ] #4 Tests cover empty/running/queued/interrupted-preserved/approval-blocked/failed/restarted/completed states and mixed-entry mutation.
<!-- AC:END -->
