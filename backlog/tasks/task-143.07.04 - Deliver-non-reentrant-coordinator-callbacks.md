---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 20:42'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the accepted semantic-context, workhorse-operation, realtime, thread-link, instruction, and timing ports into one closed callback boundary with immutable correlation and no wait_threads dependency.
2. Implement one instance-scoped bounded FIFO callback coordinator: coalesce eligible updates, drain asynchronously without reentrant delivery, revalidate child/coordinator/realtime/link after dequeue, and settle each callback once.
3. Route active callbacks through exactly one realtime appendText attempt; route only inactive operation/queue/attention callbacks through exactly one canonical developer inject_items attempt, while inactive semantic callbacks remain silent.
4. Add exhaustive focused tests for the closed union, canonical bytes, routing, ordering/coalescing, reentrancy, lifecycle races, stale identities, child exit, lost responses, reload, overflow, and every delivery outcome.
5. Run focused owner, both type graphs, scoped lint/format, inventory, diff, clean-tree, and protected-hash checks under sequential capped systemd user units; leave acceptance criteria unchecked pending independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed coordinator callback boundary in src/runtime/codex-coordinator-callbacks. Normalization covers all eight workhorse operation events plus semantic change/focus/selection with frozen correlation; the instance-scoped coordinator uses a bounded FIFO, eligible coalescing, non-reentrant draining, post-dequeue child/epoch/coordinator/link/session revalidation, active appendText or inactive operation/queue/attention inject_items routing, silent inactive semantic callbacks, one canonical developer message, and one-attempt delivered/not_delivered/outcome_unknown settlement without wait_threads or fallback. Implementation commit: b1f76af0 from fixed BASE 5842f4383bed569d876d0a05e747e551b49b74e9. Final capped validation in archboard-1430704-finalval-02.service with cgroup path printed: scoped Oxfmt check passed for 7 files; scoped Oxlint passed with 0 warnings/errors; both TypeScript graphs passed; focused callbacks passed 7 tests and 140 assertions; repository test inventory passed 39 tests and 69 assertions; git diff --cached --check passed before commit. Preserved known mandated 6G plus 1G capped-OOM fingerprints for the repository boundary, module-scope, and broad repository-policy owners; those lanes were not rerun. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress and acceptance criteria remain unchecked pending independent review.
<!-- SECTION:NOTES:END -->
