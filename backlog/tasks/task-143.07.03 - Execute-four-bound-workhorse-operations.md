---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.07.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-operations
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Execute exactly inspect, delegate, queue-management, and steer operations through the thread-link/session/queue ports and emit normalized operation events. It never waits synchronously for workhorse completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every request revalidates coordinator call, child/epoch/link/provenance/status and binds coordinator request -> clientUserMessageId -> queued submission when used -> workhorse TurnId when observed.
- [ ] #2 Inspect is read-only; delegate starts one inactive turn or queues one eligible created workhorse; queue management uses only the queue port; steer requires the exact active expectedTurnId and a single bounded input.
- [ ] #3 A lost start/steer/queue response becomes outcome_unknown and never starts a second turn or alternate operation; later authoritative events reconcile the original operation correlation.
- [ ] #4 The public output is a closed normalized operation-event union consumed by callbacks/UI, not raw app-server events or a second thread/queue store.
<!-- AC:END -->
