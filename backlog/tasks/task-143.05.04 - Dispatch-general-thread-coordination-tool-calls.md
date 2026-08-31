---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 14:27'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.19
  - TASK-143.01.20
  - TASK-143.05.01
  - TASK-143.05.02
  - TASK-143.05.03
references:
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-dynamic-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own item/tool/call validation, the literal target and transaction policy, and response construction for all six general tools. Declare five narrow injected ports inside src/runtime/codex-dynamic-tools: DynamicToolApprovalPort, DynamicThreadAuthorityPort, DynamicContextPort, DynamicOperationIdPort, and DynamicToolLifecyclePort. Session, wait graph, the seven-family app-server broker, thread link, transport, and catalogue remain separate accepted ports. No UI, composition, alternate identity minting, or ordinary approval response enters this module. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls validate the exact logical call and manifest, resolve issued caller and target identities through DynamicThreadAuthorityPort, consume actual thread-link and durable provenance proofs, and exhaust the authored table across epoch, created, attached, or foreign ownership, loaded state, direct-input capability, every status, and self or other. Every unlisted cell refuses before an effect, with no recency inference or fabricated proof.
- [ ] #2 create, fork, and send issue canonical OperationIds through DynamicOperationIdPort, stage one immutable fresh DynamicToolApprovalPort request per call, treat approval_required as terminal with no resumable card, and after approval revalidate caller, target, effect hash, lifecycle, and one current ArchboardContext. They use the exact authored ThreadStartParams, ThreadForkParams, and TurnStartParams; self-fork uses the executing turnId and ignores caller beforeTurnId; confirmed identities survive initial-turn rejection or uncertainty; no mutation retries.
- [ ] #3 list and read use the exact thread/list, loaded/list, turns/list, and conditional items/list bodies, directions, limits, projections, and epoch, method, direction, and query-bound cursors. wait binds its cursor to the sorted target set, rejects cycles before registration, and releases the exact wait owner for settle, cancellation, interruption, disconnect, or child exit through DynamicToolLifecyclePort.
- [ ] #4 The dispatcher orders validate, classify, issue IDs, approve, revalidate, read current context, stage, effect once, settle provenance, construct one canonical response, and let transport write once. Fake-port and compile fixtures exhaust every table, approval outcome, stale revalidation, body, page, projection, attention, lifecycle cleanup, cycle, partial and uncertain boundary, ID reuse, terminal approval_required, and executing-turn self-fork case while rejecting casts and seven-family approval lookalikes.
<!-- AC:END -->
