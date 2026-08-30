---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.07.01
  - TASK-143.07.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-callbacks
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the exactly-once callback ledger, buffering, and delivery policy in `src/runtime/codex-coordinator-callbacks`. It converts authoritative workhorse/queue/attention events into coordinator context without a wait tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Records are keyed by child, coordinator, workhorse, source event, and correlation and survive browser reconnect only on the same child.
- [ ] #2 Inactive-voice delivery uses `thread/inject_items`; active delivery uses developer-role `thread/realtime/appendText` only after exact current child/coordinator/realtime-session revalidation.
- [ ] #3 Delivery buffers while a coordinator turn or dynamic call is active, never reenters that call, drains in order after settlement, and permits speech only for terminal or attention policy.
- [ ] #4 Tests cover duplicates, buffering/order, coordinator interruption, dynamic-call reentrancy, same-child hydration, stale realtime sessions, and child exit.
<!-- AC:END -->
