---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.02
  - TASK-143.05.03
  - TASK-143.07.01
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
Own coordinator workhorse queue observation and mutation in `src/runtime/codex-workhorse-queue`. It consumes a fully paginated queue snapshot from the stable session port, preserves server order, and applies only to the coordinator-bound workhorse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module never paginates app-server itself; it consumes the session queue port and add/edit/cancel/reorder/start results with stable coordinator-request/workhorse-turn correlations.
- [ ] #2 Queueing is allowed only for an Archboard-created workhorse whose persisted developer-instruction and archboard_app manifest hashes match TASK-143.05.03; attached busy work is never silently queued.
- [ ] #3 Reorder sends every submission ID, changes only coordinator-owned entries, and preserves foreign/unowned entries and relative order.
- [ ] #4 Tests in src/runtime/codex-workhorse-queue/tests cover empty/running/queued/interrupted-preserved/approval-blocked/failed/restarted/completed/mixed states plus lost list/start responses without duplicate turns.
<!-- AC:END -->
