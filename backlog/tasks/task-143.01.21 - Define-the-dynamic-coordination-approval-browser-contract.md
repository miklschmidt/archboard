---
id: TASK-143.01.21
title: Define the dynamic coordination approval browser contract
status: To Do
assignee: []
created_date: '2026-08-31 14:26'
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
