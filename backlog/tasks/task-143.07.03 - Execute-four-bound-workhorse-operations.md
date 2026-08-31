---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 19:05'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.20
  - TASK-143.07.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-operations
  - src/runtime/codex-workhorse-operations/tests/operations.test.ts
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Execute exactly inspect, delegate, queue-management, and steer operations through the thread-link/session/queue ports and emit normalized operation events. It never waits synchronously for workhorse completion.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every request revalidates coordinator call, child/epoch/link/provenance/status and binds coordinator request -> clientUserMessageId -> queued submission when used -> workhorse TurnId when observed.
- [ ] #2 Inspect is read-only; delegate starts one inactive turn or queues one eligible created workhorse; queue management uses only the queue port; steer requires the exact active expectedTurnId and a single bounded input.
- [ ] #3 A lost start/steer/queue response becomes outcome_unknown and never starts a second turn or alternate operation; later authoritative events reconcile the original operation correlation.
- [ ] #4 The public output is a closed normalized operation-event union consumed by callbacks/UI, not raw app-server events or a second thread/queue store.
- [ ] #5 src/runtime/codex-workhorse-operations/tests/operations.test.ts exhausts inspect, delegate, queue-management, and steer across every identity/status/queue race and delivered/not_delivered/outcome_unknown result, proving one attempt and stable operation correlation.
- [ ] #6 Every delegate, queue mutation, and steer correlation uses the shared canonical OperationId authority and reuses the same identity across clientUserMessageId, durable operation state, normalized events, callbacks, and browser results without local string minting.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a closed workhorse-operation port with one coordinator-call/link/provenance snapshot, canonical OperationId authority, durable epoch correlation, and normalized immutable operation-event union. 2. Implement serialized inspect, delegate, queue-management, and steer flows with fresh revalidation, literal bounded turn bodies, one-attempt settlement, queue-port delegation, and authoritative notification reconciliation without waiting for completion. 3. Add focused fake-port tests covering all four operations, identity/status/queue races, delivered/not_delivered/outcome_unknown outcomes, stable correlation, and terminal event clearing. 4. Run sequential capped focused tests plus scoped strict type, lint, format, inventory, policy, and diff checks; audit the protected bundle and unrelated work. 5. Commit the path-disjoint implementation and leave acceptance criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed inspect/delegate/queue-management/steer port with exact call/link/provenance revalidation, canonical OperationId correlation, literal bounded turn bodies, serialized queue delegation, durable epoch settlement, one-attempt unknown recovery, pre-response notification handling, and an immutable normalized event union. Added focused fake-port owners for delivered, not_delivered, outcome_unknown, queue reconciliation, terminal clearing, link races, and early turn evidence. Validation under named systemd user services capped at MemoryMax=6G and MemorySwapMax=1G: 11 focused tests / 49 expectations, both strict TypeScript graphs, scoped Oxlint, and scoped Oxfmt passed. The full-tree boundaries and module-scope repository-policy subprocesses hit the enforced 6G+1G cap and were not rerun; test-inventory passed 39 tests / 69 expectations. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with acceptance criteria unchecked pending independent review.
<!-- SECTION:NOTES:END -->
