---
id: TASK-143.01.06
title: Frame one Codex app-server JSON-RPC connection
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 02:24'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.03
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-transport
  - src/runtime/codex-transport/tests/transport.test.ts
  - src/shared/codex-app-server-capacity
  - src/shared/codex-workbench-identity
  - tests/system/repository-policy/codex-app-server-capacity.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own newline-delimited JSON-RPC framing, request/reverse-request correlation, cancellation settlement, late-result retention, and wire shutdown for one child epoch. It performs no semantic retry and constructs no tool result.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Client requests, responses, notifications, errors, and reverse requests correlate by child, epoch, and requestId; logical dynamic calls retain child, epoch, threadId, turnId, callId, namespace, tool, and manifestHash.
- [ ] #2 A local timeout or cancellation settles only the local waiter and never claims remote cancellation; late responses remain inspectable and non-idempotent lost responses classify as outcome_unknown.
- [ ] #3 Only newline-delimited stdout frames enter the decoder, stderr drains independently, malformed/duplicate/unknown frames fail the owning operation without corrupting later frames, and backpressure is bounded.
- [ ] #4 codex-approvals owns seven human responses, the two dynamic dispatchers own item/tool/call responses, and codex-session owns currentTime plus unsupported refresh/attestation responses. Transport validates correlation and writes each supplied response at most once.
- [ ] #5 src/runtime/codex-transport/tests/transport.test.ts exhausts framing, every message direction, correlation, cancellation, late/duplicate/malformed frames, bounded backpressure, response ownership, one-write settlement, and shutdown against fake child streams.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the frozen identity, generated protocol decoder, shared timing, process-stream, and response-ownership contracts at the transport boundary.
2. Implement one instance-scoped newline JSON-RPC transport with bounded writes, exact child/epoch/request and dynamic-call correlation, local settlement, inspectable late results, and deterministic shutdown.
3. Add fake-child stream tests for every direction, response owner, malformed/duplicate/unknown frames, timeout/cancellation, late outcome_unknown results, bounded backpressure, one-write response settlement, and recovery of later frames.
4. Run focused transport tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.

5. Apply the reviewed shared Codex app-server capacity authority, then remediate strict envelope direction, duplicate-key rejection, method-specific reverse schemas, numeric wire IDs, reverse error settlement, two-lane atomic response admission, terminal detachment, deep redacted projections, and adversarial public oracles.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel reservation at integration HEAD 863ec41 after removing the unjustified worker/reviewer caps: TASK-143.01.06 is dependency-ready and path-disjoint from every active leaf. It is dispatched alongside all other ready leaves; only dependency and file-ownership conflicts serialize later work.

Implemented the instance-scoped Codex app-server JSONL transport under src/runtime/codex-transport. It owns complete-line stdout framing, independent stderr draining, bounded writes, request and reverse-request correlation, local timeout/cancellation settlement, inspectable late results, response ownership, and deterministic shutdown. Dynamic tool result construction remains outside the transport. Validation passed: bun test --isolate src/runtime/codex-transport (7 tests), bun run test:modules (1,020 tests), bun run test:repository (130 tests), bun run type-check, bun run lint, bun run fmt:check, and git diff --check. The task remains In Progress for independent review; acceptance criteria and terminal status were not changed.

Remediation committed as 3fea481 (fix(codex-transport): harden app-server wire lifecycle), following the initial implementation 103ddf8 and fixed BASE b5d5062. Centralized all non-duration limits in src/shared/codex-app-server-capacity; added strict duplicate-key JSONL decoding, typed numeric/string wire IDs, dual regular/response admission, owner-aware method-specific reverse validation, bounded late/diagnostic projections, accepted-write settlement semantics, fatal oversized-frame handling, and terminal/shutdown detachment.

Current focused validation: transport contract tests 20 pass / 0 fail / 126 expect across 4 files; capacity and repository-policy tests 6 pass / 0 fail / 152 expect across 2 files; bun run type-check, bun run lint, bun run fmt:check, and git diff --check pass. Preserved broad evidence from before the parent OOM guard: bun run test:modules 1,033 pass / 0 fail / 7,173 expect across 80 files, and bun run test:repository 134 pass / 0 fail / 559 expect across 12 files. No broad lane was rerun after that guard. Task remains In Progress pending independent review; acceptance criteria and terminal status were not changed.
<!-- SECTION:NOTES:END -->
