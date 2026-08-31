---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 19:50'
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
- [x] #1 Every request revalidates coordinator call, child/epoch/link/provenance/status and binds coordinator request -> clientUserMessageId -> queued submission when used -> workhorse TurnId when observed.
- [x] #2 Inspect is read-only; delegate starts one inactive turn or queues one eligible created workhorse; queue management uses only the queue port; steer requires the exact active expectedTurnId and a single bounded input.
- [x] #3 A lost start/steer/queue response becomes outcome_unknown and never starts a second turn or alternate operation; later authoritative events reconcile the original operation correlation.
- [x] #4 The public output is a closed normalized operation-event union consumed by callbacks/UI, not raw app-server events or a second thread/queue store.
- [x] #5 src/runtime/codex-workhorse-operations/tests/operations.test.ts exhausts inspect, delegate, queue-management, and steer across every identity/status/queue race and delivered/not_delivered/outcome_unknown result, proving one attempt and stable operation correlation.
- [x] #6 Every delegate, queue mutation, and steer correlation uses the shared canonical OperationId authority and reuses the same identity across clientUserMessageId, durable operation state, normalized events, callbacks, and browser results without local string minting.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bind each logical coordinator call to the captured child, epoch, and coordinator thread, then reclassify call/link/provenance/status after staging and context construction and at the queue port's final pre-RPC boundary. 2. Permit direct idle delegation and exact active steering for executable attached workhorses; reserve created provenance for active delegation queueing and queue management, while inspect skips unavailable queue access. 3. Extend the queue-start result with the exact session TurnId and a pre-effect authorization hook; retain queued operation state and join queued submission, client message, authoritative turn, progress, and completion without minting identities. 4. Snapshot subscriber cohorts and isolate listener failures so callbacks cannot alter staging, settlement, or ordered fanout. 5. Split focused test support as needed to keep every TypeScript file below 500 lines, then cover attached authority, stale identity and status states, final-boundary revocation, cache refusal, subscriber failure and reentrancy, all queue outcomes, and queued start-to-completion correlation. 6. Run sequential named 6G+1G capped focused queue and operation owners, both type graphs, scoped lint and format, inventory, diff and clean-tree checks; preserve known OOM fingerprints, verify the protected hash, commit, and return the complete fixed range for rereview.

7. Carry the exact targeted baseline submission and its clientUserMessageId through queue-start authorization/result handling before the RPC, then prove a lost start for an otherwise untracked submission reconciles directly from authoritative turn events with one attempt. 8. Replace synchronous nested event fanout with an instance-scoped FIFO publication drain that freezes each event, snapshots its listener cohort at publication, isolates listener failures, and completes every listener for event N before delivering reentrant event N+1; pin the total order with two listeners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed inspect/delegate/queue-management/steer port with exact call/link/provenance revalidation, canonical OperationId correlation, literal bounded turn bodies, serialized queue delegation, durable epoch settlement, one-attempt unknown recovery, pre-response notification handling, and an immutable normalized event union. Added focused fake-port owners for delivered, not_delivered, outcome_unknown, queue reconciliation, terminal clearing, link races, and early turn evidence. Validation under named systemd user services capped at MemoryMax=6G and MemorySwapMax=1G: 11 focused tests / 49 expectations, both strict TypeScript graphs, scoped Oxlint, and scoped Oxfmt passed. The full-tree boundaries and module-scope repository-policy subprocesses hit the enforced 6G+1G cap and were not rerun; test-inventory passed 39 tests / 69 expectations. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with acceptance criteria unchecked pending independent review.

Remediated the accepted review findings without changing task status or acceptance checks. Direct idle delegation and exact active steering now accept executable attached workhorses, while queue authority remains created-only and inspect skips unavailable queue access. Logical calls bind to the exact child, epoch, and coordinator thread; staging, context construction, and the queue port's post-baseline pre-RPC hook repeat current call/link/provenance/status checks. Queue-start now returns the exact session TurnId, queued correlations remain live through authoritative start/progress/completion, and lost queue-start settlement can reconcile through the original queued client identity. Listener fanout snapshots its cohort and isolates exceptions. Split steer and delivery-test owners keep every TypeScript file below 500 lines. Final named systemd user services, each with WorkingDirectory=/home/msc/.codex/worktrees/d4d8/archboard, MemoryMax=6G, MemorySwapMax=1G: focused queue/operation owners passed 42 tests / 169 expectations; both TypeScript graphs passed; scoped Oxlint passed 0 warnings/errors; scoped Oxfmt check passed; test inventory passed 39 tests / 69 expectations. Preserved the prior capped-OOM fingerprints for boundaries, module-scope, and broad repository-policy lanes and did not rerun them. Task remains In Progress with acceptance criteria unchecked for complete fixed-range rereview.

Second remediation resolves both remaining accepted review findings. Queue mutation authorization now receives the exact authoritative baseline target; queue-start preserves its clientUserMessageId before the RPC and returns it with the result, so a lost response for a preexisting/restored queue item with no companion operation can reconcile directly from authoritative turn start/completion notifications without another attempt. Operation-event publication now uses an instance-scoped FIFO drain with a publication-time listener cohort, isolated listener failures, and total order across nested emissions. Added direct regression owners for both paths and split queue helpers/test support so every TypeScript file remains below 500 lines. Final named systemd user services, each with WorkingDirectory=/home/msc/.codex/worktrees/d4d8/archboard, MemoryMax=6G, MemorySwapMax=1G: focused queue/operation/delivery owners passed 44 tests / 176 expectations; both strict TypeScript graphs passed; scoped Oxlint passed 0 warnings/errors across 24 files; scoped Oxfmt check passed across 24 files; test inventory passed 39 tests / 69 expectations. Known capped-OOM fingerprints for boundaries, module-scope, and broad repository-policy were preserved and not rerun. Task remains In Progress with acceptance criteria unchecked pending complete-range rereview.

Final acceptance mapping after independent REVIEW_CLEAN of 93b20e4f..855ccef5. AC1 is proved by exact child/epoch/coordinator binding, repeated call/link/provenance/status checks, and request -> clientUserMessageId -> queued submission -> authoritative TurnId correlation. AC2 is proved by read-only inspect, attached-idle direct delegation, created-only active queueing and queue management, queue-port-only mutations, and exact authoritative expectedTurnId steering with one bounded input. AC3 is proved by one-attempt outcome_unknown handling plus later authoritative reconciliation for start, steer, and queue paths, including the no-companion lost queue-start regression. AC4 is proved by the closed immutable normalized event union and instance-local FIFO callback publication with listener isolation. AC5 is proved by the focused race/outcome owners: worker run 44 tests / 176 expectations and independent queue+operations run 33 tests / 127 expectations, both with zero failures. AC6 is proved by shared OperationId authority continuity across serialized client identity, durable operation state, normalized events, callbacks, and results without local identity minting. Both strict type graphs, scoped lint and format, and inventory passed. Reviewer reported no findings. Known capped-OOM fingerprints for boundaries, module-scope, and broad repository-policy remain preserved and were not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed inspect, delegate, queue-management, and steer execution with exact authority revalidation, canonical operation correlation, one-attempt unknown recovery, authoritative queue-to-turn reconciliation, and ordered normalized callback events. Verified by 44 tests / 176 expectations, an independent clean review with 33 tests / 127 expectations, both type graphs, scoped lint/format, inventory, and clean range checks.
<!-- SECTION:FINAL_SUMMARY:END -->
