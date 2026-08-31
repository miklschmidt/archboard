---
id: TASK-143.01.21
title: Define the dynamic coordination approval browser contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-31 14:26'
updated_date: '2026-08-31 17:56'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.19
  - TASK-143.01.20
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-browser-model
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 257000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the closed browser model with a distinct dynamic coordination approval request, state, and response command for create_thread, fork_thread, and send_message_to_thread. It projects the reviewed immutable effect and OperationId without pretending to be any of the seven app-server BrowserApproval families. This leaf owns DTOs and strict schemas only; the gateway, dispatcher, visual component, and production composition stay separate. Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A closed dynamic coordination approval DTO carries the exact current child, epoch, caller, call, operation, tool, target when present, effective boundary, bounded effect disclosure, effect hash, expiry, and pending or terminal state without raw protocol objects or ordinary ApprovalId fabrication.
- [ ] #2 The dynamic response command is binary approve or decline and binds the browser lease, captured pane and link, current child epoch, OperationId, logical call identity, and effect hash; focus or navigation cannot retarget it.
- [ ] #3 The DTO represents pending, approved, declined, expired, cancelled, disconnected, stale, delivered, not_delivered, and outcome_unknown states needed by the reviewed lifecycle, while terminal approval_required carries no resumable browser authority.
- [ ] #4 Strict schema, round-trip, secret-boundary, and type fixtures reject every seven-family lookalike, identity-domain swap, unknown state, stale epoch, effect-hash mismatch, unsafe extra field, duplicate response, and fabricated resume command.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a private dynamic-approval contract module under src/shared/codex-browser-model and expose its closed schemas/types from the module root, using only the existing branded identity and OperationId authorities. 2. Model the exact ordered logical-call identity, three immutable tool effects, effective boundary, bounded visual summary, effect hash, creation/expiry, and pending or terminal lifecycle without ordinary ApprovalId or raw protocol values. 3. Add a binary browser approve/decline command bound to lease, pane/link, child epoch, logical call, OperationId, and effect hash; add strict relational refinements for current epoch, effect hash, state/decision shape, duplicate-safe terminal representation, and non-resumable approval_required. 4. Extend module-owned fixtures/tests for round trips, all lifecycle states, seven-family separation, secret/extra-field rejection, identity swaps, stale epoch, hash mismatch, duplicate decisions, and fabricated resume; add compile-time type fixtures. 5. Run focused tests, both TypeScript projects, scoped lint/format, repository inventory/policy checks, and git diff --check in sequential capped systemd user services; preserve unrelated/protected work, commit only this module and task metadata, and leave the task In Progress for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed dynamic coordination approval browser contract under src/shared/codex-browser-model. Added authority-bound immutable request/effect schemas for create_thread, fork_thread, and send_message_to_thread; safe secret-free browser projections; binary lease/pane/link/child-epoch/identity/OperationId/effect-hash response; exact expiry/hash/state/decision refinements; and module tests/type fixtures. Kept runtime, gateway, dispatcher, UI, and composition out of scope.

Validation: focused browser-model tests pass (16 tests, 199 expectations); dynamic authored policy owner passes (11 tests, 322 expectations); both TypeScript projects, scoped Oxlint, scoped Oxfmt, git diff --check, repository inventory, authored-contract, and protocol-alias policy owners pass. The scoped codex-protocol-boundary owner was previously killed by its capped cgroup (known OOM-prone lane) and was not rerun. Protected frontend bundle is absent in this worktree. Task remains In Progress for independent review.
<!-- SECTION:NOTES:END -->
