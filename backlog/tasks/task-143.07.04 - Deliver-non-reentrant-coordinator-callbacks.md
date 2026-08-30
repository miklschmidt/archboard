---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.02.03
  - TASK-143.06.01
  - TASK-143.07.01
  - TASK-143.07.02
  - TASK-143.07.03
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
Own the callback ledger, buffering, and semantic/operation delivery policy in `src/runtime/codex-coordinator-callbacks`. It consumes named semantic-context, workhorse-operation, queue, attention, and guarded realtime-append ports; it never waits or calls app-server directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Records are keyed by child, coordinator, workhorse, semantic or operation source, and stable correlation and survive browser reconnect only on the same child.
- [ ] #2 Inactive voice dispatches thread/inject_items at most once with delivered, not_delivered, or outcome_unknown because 0.151.0 supplies no idempotency key; active voice uses only codex-realtime's guarded developer append port after binding revalidation.
- [ ] #3 Delivery buffers while a coordinator turn or dynamic call is active, never reenters it, compacts within the semantic brief budget, drains in order after settlement, and permits speech only for terminal or attention policy.
- [ ] #4 Tests in src/runtime/codex-coordinator-callbacks/tests cover semantic freshness/ambiguity, operation correlation, duplicates, lost response, buffering/order, interruption, dynamic-call reentrancy, stale realtime, same-child hydration, and child exit.
<!-- AC:END -->
