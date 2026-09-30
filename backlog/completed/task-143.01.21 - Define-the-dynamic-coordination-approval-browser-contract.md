---
id: TASK-143.01.21
title: Define the dynamic coordination approval browser contract
status: Done
assignee:
  - '@codex'
created_date: '2026-08-31 14:26'
updated_date: '2026-08-31 18:26'
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
- [x] #1 A closed dynamic coordination approval DTO carries the exact current child, epoch, caller, call, operation, tool, target when present, effective boundary, bounded effect disclosure, effect hash, expiry, and pending or terminal state without raw protocol objects or ordinary ApprovalId fabrication.
- [x] #2 The dynamic response command is binary approve or decline and binds the browser lease, captured pane and link, current child epoch, OperationId, logical call identity, and effect hash; focus or navigation cannot retarget it.
- [x] #3 The DTO represents pending, approved, declined, expired, cancelled, disconnected, stale, delivered, not_delivered, and outcome_unknown states needed by the reviewed lifecycle, while terminal approval_required carries no resumable browser authority.
- [x] #4 Strict schema, round-trip, secret-boundary, and type fixtures reject every seven-family lookalike, identity-domain swap, unknown state, stale epoch, effect-hash mismatch, unsafe extra field, duplicate response, and fabricated resume command.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pending-aware response parser that requires one exact pending BrowserDynamicApproval and compares the browser lease, pane, captured link, complete logical identity, and effect hash, rejecting terminal/replayed responses. 2. Replace permissive lifecycle refinements with an exhaustive closed relation table for decision, delivery, toolResult, binding, and resumable fields, including exact disconnect and approval_required arms. 3. Add literal canonical compact JSON and independently computed SHA-256 vectors for create, self-fork, other-fork, send, nullability, and UTF-8 summaries. 4. Make BrowserSnapshot.dynamicApprovals required and update only module-owned fixtures/tests/type assertions. 5. Re-run focused/public probes, both TypeScript projects, scoped lint/format, inventory/authored policy owners, and diff checks under capped systemd services; preserve the known boundary-owner OOM limitation and commit the remediation. 6. After clean independent review, finalize the task metadata and mark the task Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed dynamic coordination approval browser contract under src/shared/codex-browser-model. Added authority-bound immutable request/effect schemas for create_thread, fork_thread, and send_message_to_thread; safe secret-free browser projections; binary lease/pane/link/child-epoch/identity/OperationId/effect-hash response; exact expiry/hash/state/decision refinements; and module tests/type fixtures. Kept runtime, gateway, dispatcher, UI, and composition out of scope.

Validation: focused browser-model tests pass (16 tests, 199 expectations); dynamic authored policy owner passes (11 tests, 322 expectations); both TypeScript projects, scoped Oxlint, scoped Oxfmt, git diff --check, repository inventory, authored-contract, and protocol-alias policy owners pass. The scoped codex-protocol-boundary owner was previously killed by its capped cgroup (known OOM-prone lane) and was not rerun. Protected frontend bundle is absent in this worktree. Task remains In Progress for independent review.

Review remediation implemented: added pending-aware response schema/parser with exact pending lease, pane, captured link, logical identity, and effect-hash matching; terminal/replayed cards without bindings are rejected. Replaced permissive lifecycle checks with exhaustive closed state arms, added independent literal canonical JSON and SHA-256 vectors for create, self-fork, other-fork, send, nullability, and UTF-8, and made snapshot dynamicApprovals required. Validation passed: 18 focused tests / 243 expectations, both TypeScript projects, scoped lint/format, dynamic policy owner, test inventory, authored-contract, protocol-alias owner, and diff checks. The known codex-protocol-boundary OOM lane remains intentionally unrerun. Task remains In Progress with ACs unchecked.

Finalization evidence: independent review reported REVIEW_CLEAN for the complete implementation range ending at aa61a76cd4d623fbccd0d77f8a75bdeb2fec3e15. The four acceptance criteria were checked after objective verification. Focused browser-model validation passed 18 tests / 243 expectations; both TypeScript projects, scoped Oxlint/Oxfmt, dynamic policy (11 tests / 322 expectations), inventory (39 / 69), authored-contract (4 / 18), protocol-alias (2 / 14), and git diff --check passed. The protected frontend bundle is absent in this worktree, so no protected hash changed. The known codex-protocol-boundary owner was killed once by the capped cgroup and was not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and independently reviewed the closed dynamic coordination approval browser contract. The model now binds responses to the exact pending approval, enforces exhaustive lifecycle arms, verifies literal canonical SHA-256 vectors, and requires dynamicApprovals in snapshots. Verified with 18 focused tests / 243 expectations, both TypeScript projects, scoped lint/format, repository inventory, authored policy, protocol aliases, and diff checks; independent review was clean. Complete implementation range: 8521dd6d9e9e5e21532651b9127d55167b0a2ebd..aa61a76cd4d623fbccd0d77f8a75bdeb2fec3e15.
<!-- SECTION:FINAL_SUMMARY:END -->
