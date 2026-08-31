---
id: TASK-143.01.19
title: Freeze dynamic coordination approval lifecycle
status: To Do
assignee: []
created_date: '2026-08-31 14:25'
labels: []
dependencies:
  - TASK-143.01.17
  - TASK-143.05.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - docs/design/codex-workbench-authored-contracts.md
  - tests/system/repository-policy/codex-authored-contracts.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the human-reviewed dynamic create, fork, and send approval policy that general dispatchers load and enforce. Freeze one fresh visual decision per call, immutable identity and effect snapshots, exact effect hashing and revalidation, terminal approval_required behavior, cancellation and disconnect settlement, and operation-ID reuse across every mutation boundary. This leaf authors policy only; it does not implement the dispatcher, browser adapter, UI, or the seven-family app-server approval broker. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The authored contract defines one closed dynamic-approval request identity and immutable effect union for create_thread, fork_thread, and send_message_to_thread, including caller, target, effective self-fork boundary, parsed arguments, bounded visual summary, canonical effect hash, created time, expiry, and one host OperationId.
- [ ] #2 Decision outcomes are exactly approved, declined, expired, cancelled, and disconnected; every outcome has a deterministic no-effect or revalidation path, and approval_required is a terminal no-resume tool result that leaves no pending card or reusable authority.
- [ ] #3 The contract fixes dispatcher order and refusal mapping: validate and classify, issue operation IDs, await one fresh approval, revalidate exact caller, target, effect, and context, stage each local transaction, attempt each remote mutation once, settle durable provenance, and respond once.
- [ ] #4 Repository-policy tests parse and pin the closed policy and independently reject missing, extra, reordered, duplicated, or changed identity fields, effect fields, outcomes, refusal mappings, expiry and disconnect behavior, operation-ID boundary rules, and any approval_required resume path.
<!-- AC:END -->
