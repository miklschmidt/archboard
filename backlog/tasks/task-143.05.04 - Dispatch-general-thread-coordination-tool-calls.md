---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 21:02'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the closed dynamic-dispatch contract in src/runtime/codex-dynamic-tools with exactly five injected port interfaces, typed call/approval/lifecycle/provenance outcomes, and the fixed manifest/target/dispatcher policies; keep session, wait graph, approval broker, thread link, transport, and catalogue as separate ports.
2. Implement fail-closed call validation and exact caller/target classification through issued identity, thread-link, epoch/provenance, and context authorities; refuse every unlisted matrix cell before an effect and never infer from recency.
3. Implement list/read projections with exact session request bodies and epoch/method/direction/query-bound cursors, plus create/fork/send approval, immutable effect hashing, post-approval revalidation, one-shot epoch staging/remote settlement, confirmed identity preservation, and canonical response construction.
4. Implement wait target canonicalization, cursor binding, cycle rejection before registration, and exact lifecycle owner cleanup for every authored settlement and teardown event.
5. Add exhaustive fake-port and compile fixtures for matrix cells, approval outcomes, stale/uncertain boundaries, body/page/projection contracts, wait/cycle/cleanup, identity reuse, terminal approval_required, and self-fork; run focused capped tests, strict type/lint/format/inventory/policy checks, diff audit, then commit with acceptance criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the six general archboard_app dynamic tool boundary in src/runtime/codex-dynamic-tools: exact manifest/correlation validation, proof-backed classification, literal list/read projections and cursors, immutable approval/effect/revalidation policy, one-shot create/fork/send execution, canonical responses, and wait graph/lifecycle cleanup. Added fake-port, adversarial, projection, cursor, and compile fixtures; tightened self/other fork-boundary validation and pane-authority identity revalidation.

Validation: bun run type-check, scoped oxlint, bun run fmt:check, 28 focused tests (4 files), and the dedicated 11-test repository contract policy all pass. The full repository-policy inventory reached the 6 GiB service cap after the boundary owners passed, so that combined lane was not rerun; browser lanes were not run per task scope. Acceptance criteria remain unchecked for independent review.

Remediation: terminalize every issued mutation and initial-turn OperationId exactly once at durable settlement or approved no-effect cleanup; preserve boundary-invalid success:false versus post-validation success:true refusal semantics; and project bounded, ordered textual command/file/function/MCP outputs only when includeOutputs is true, rejecting wrong-turn item pages. Added exception and truncation regression coverage while keeping the task In Progress and acceptance criteria unchecked.
<!-- SECTION:NOTES:END -->
