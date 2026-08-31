---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 19:31'
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
1. Bind each logical coordinator call to the captured child, epoch, and coordinator thread, then reclassify call/link/provenance/status after staging and context construction and at the queue port's final pre-RPC boundary. 2. Permit direct idle delegation and exact active steering for executable attached workhorses; reserve created provenance for active delegation queueing and queue management, while inspect skips unavailable queue access. 3. Extend the queue-start result with the exact session TurnId and a pre-effect authorization hook; retain queued operation state and join queued submission, client message, authoritative turn, progress, and completion without minting identities. 4. Snapshot subscriber cohorts and isolate listener failures so callbacks cannot alter staging, settlement, or ordered fanout. 5. Split focused test support as needed to keep every TypeScript file below 500 lines, then cover attached authority, stale identity and status states, final-boundary revocation, cache refusal, subscriber failure and reentrancy, all queue outcomes, and queued start-to-completion correlation. 6. Run sequential named 6G+1G capped focused queue and operation owners, both type graphs, scoped lint and format, inventory, diff and clean-tree checks; preserve known OOM fingerprints, verify the protected hash, commit, and return the complete fixed range for rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed inspect/delegate/queue-management/steer port with exact call/link/provenance revalidation, canonical OperationId correlation, literal bounded turn bodies, serialized queue delegation, durable epoch settlement, one-attempt unknown recovery, pre-response notification handling, and an immutable normalized event union. Added focused fake-port owners for delivered, not_delivered, outcome_unknown, queue reconciliation, terminal clearing, link races, and early turn evidence. Validation under named systemd user services capped at MemoryMax=6G and MemorySwapMax=1G: 11 focused tests / 49 expectations, both strict TypeScript graphs, scoped Oxlint, and scoped Oxfmt passed. The full-tree boundaries and module-scope repository-policy subprocesses hit the enforced 6G+1G cap and were not rerun; test-inventory passed 39 tests / 69 expectations. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with acceptance criteria unchecked pending independent review.

Remediated the accepted review findings without changing task status or acceptance checks. Direct idle delegation and exact active steering now accept executable attached workhorses, while queue authority remains created-only and inspect skips unavailable queue access. Logical calls bind to the exact child, epoch, and coordinator thread; staging, context construction, and the queue port's post-baseline pre-RPC hook repeat current call/link/provenance/status checks. Queue-start now returns the exact session TurnId, queued correlations remain live through authoritative start/progress/completion, and lost queue-start settlement can reconcile through the original queued client identity. Listener fanout snapshots its cohort and isolates exceptions. Split steer and delivery-test owners keep every TypeScript file below 500 lines. Final named systemd user services, each with WorkingDirectory=/home/msc/.codex/worktrees/d4d8/archboard, MemoryMax=6G, MemorySwapMax=1G: focused queue/operation owners passed 42 tests / 169 expectations; both TypeScript graphs passed; scoped Oxlint passed 0 warnings/errors; scoped Oxfmt check passed; test inventory passed 39 tests / 69 expectations. Preserved the prior capped-OOM fingerprints for boundaries, module-scope, and broad repository-policy lanes and did not rerun them. Task remains In Progress with acceptance criteria unchecked for complete fixed-range rereview.
<!-- SECTION:NOTES:END -->
