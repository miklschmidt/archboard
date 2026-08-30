---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 18:07'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.02.03
  - TASK-143.06.01
  - TASK-143.07.01
  - TASK-143.07.03
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-coordinator-callbacks
  - src/runtime/codex-coordinator-callbacks/tests/callbacks.test.ts
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver non-reentrant coordinator callbacks from normalized semantic and workhorse-operation events using a closed callback union and canonical developer-role bytes. The callback path never blocks in wait_threads.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The closed callback union covers operation accepted/queued/started/progress/attention/completed/failed/outcome_unknown and semantic change/focus/selection with immutable operation/thread/turn/queue/session correlation.
- [ ] #2 After dequeue, the module revalidates current child/coordinator/realtime/link and chooses exactly one path: active realtime appendText, or inactive inject_items only for operation/queue/attention callbacks; semantic callbacks are silent while voice is inactive.
- [ ] #3 Each callback uses exactly one developer-role message with one input_text part matching the canonical bytes, is attempted once, and settles delivered/not_delivered/outcome_unknown without fallback retry to the other path.
- [ ] #4 Buffer order, coalescing, callback-during-callback, active-to-inactive race, stale session/link, child exit, lost response, reload, and bounded overflow are tested with no reentrant turn or duplicate narration.
- [ ] #5 src/runtime/codex-coordinator-callbacks/tests/callbacks.test.ts exhausts the closed callback union, realtime/inject routing, ordering, coalescing, reentrancy, lifecycle races, stale identity, overflow, reload, and every delivery outcome using the canonical bytes.
<!-- AC:END -->
