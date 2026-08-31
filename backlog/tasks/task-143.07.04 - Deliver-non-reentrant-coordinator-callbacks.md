---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 21:07'
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
  - docs/design/codex-workbench-authored-contracts.md
  - tests/system/repository-policy/codex-authored-contracts.test.ts
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
1. Replace the generic context callback payload with a closed, bounded, deterministic encoding for all eight operation and three semantic callback variants; document and policy-test the exact developer-message bytes.
2. Capture immutable child, coordinator, workhorse-link, provenance, binding revision, and realtime-generation correlation when each source event enters the FIFO.
3. Revalidate the exact workhorse link through the live classifier as the last asynchronous authority read, then synchronously compare current child, ready coordinator, binding, callback correlation, and realtime generation before one delivery attempt.
4. Route inactive operation callbacks to the coordinator through one developer thread/inject_items item; route active callbacks through a narrow developer-role realtime session adapter using exact wire and browser generation identities. Preserve no fallback and outcome_unknown after an attempted mutation loses authority.
5. Split focused owners under 500 lines and cover all eleven variants, golden bytes and bounds, inactive and active races, FIFO/coalescing/overflow/listener faults/disposal, retained reload state and subscriptions, forbidden waits/casts/retries, and route request shape.
6. Run the requested focused, contract, type-graph, lint/format, inventory, diff, length, authored-policy, clean-tree, and protected-artifact checks in sequential capped transient units; record only new evidence and retain known OOM fingerprints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed coordinator callback boundary in src/runtime/codex-coordinator-callbacks. Normalization covers all eight workhorse operation events plus semantic change/focus/selection with frozen correlation; the instance-scoped coordinator uses a bounded FIFO, eligible coalescing, non-reentrant draining, post-dequeue child/epoch/coordinator/link/session revalidation, active appendText or inactive operation/queue/attention inject_items routing, silent inactive semantic callbacks, one canonical developer message, and one-attempt delivered/not_delivered/outcome_unknown settlement without wait_threads or fallback. Implementation commit: b1f76af0 from fixed BASE 5842f4383bed569d876d0a05e747e551b49b74e9. Final capped validation in archboard-1430704-finalval-02.service with cgroup path printed: scoped Oxfmt check passed for 7 files; scoped Oxlint passed with 0 warnings/errors; both TypeScript graphs passed; focused callbacks passed 7 tests and 140 assertions; repository test inventory passed 39 tests and 69 assertions; git diff --cached --check passed before commit. Preserved known mandated 6G plus 1G capped-OOM fingerprints for the repository boundary, module-scope, and broad repository-policy owners; those lanes were not rerun. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress and acceptance criteria remain unchecked pending independent review.

Remediation of reviewer findings 1-5 replaces generic context delivery with deterministic closed callback bytes, coordinator-only inactive injection, and a narrow developer-role realtime session adapter. Each enqueued callback freezes the accepted binding revision, exact classifier target and durable provenance, plus wire/browser realtime generation when active. Delivery classifies that exact target as its last asynchronous authority read, then synchronously rechecks child, ready coordinator, binding, callback correlation, and generation before one RPC. Post-attempt authority loss settles outcome_unknown with no fallback. The authored contract now pins the byte grammar and route policy. Focused owners split below 500 lines and cover all eleven variants, exact snapshot bytes, hostile mutation and bounds, queue tuples, semantic focus/selection, inactive operation families, active developer request shape, authority races, one-attempt outcomes, FIFO/coalescing/overflow, listener cleanup, disposal, and kept reload subscriptions.

Final capped validation: archboard-1430704-remediate-final-01.service printed cgroup and passed 17 callback tests, 21 affected session/realtime/thread-link tests, both TypeScript graphs, scoped Oxlint, scoped Oxfmt check, 44 authored-contract and inventory tests, staged diff check, clean unstaged diff, source lengths, and protected artifact hash/size. archboard-1430704-remediate-sourcegate-03.service separately proved no casts, wait dependency, RealtimeHost, or user role in callback lib and exactly one realtimeAppendText plus one threadInjectItems call site. Preserved known 6G plus 1G capped-OOM fingerprints for broad repository boundary, module-scope, and repository-policy owners; those lanes were not rerun. Protected artifact remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress and all acceptance criteria remain unchecked for independent rereview.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-31 20:50
---
Remediation started from reviewer findings 1-5. Acceptance criteria remain unchecked and the task remains In Progress.
---

author: @codex
created: 2026-08-31 21:07
---
Remediation is ready for independent rereview. Task status and acceptance criteria intentionally remain unchanged.
---
<!-- COMMENTS:END -->
