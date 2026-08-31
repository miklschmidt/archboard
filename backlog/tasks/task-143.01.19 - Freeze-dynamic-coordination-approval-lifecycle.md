---
id: TASK-143.01.19
title: Freeze dynamic coordination approval lifecycle
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-31 14:25'
updated_date: '2026-08-31 15:16'
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
  - tests/system/repository-policy/codex-dynamic-approval-contract.test.ts
  - tests/system/repository-policy/support/codex-dynamic-approval-policy.ts
  - tests/system/repository-policy/support/codex-dynamic-approval-fixed.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one strict, versioned dynamic-coordination approval manifest to docs/design/codex-workbench-authored-contracts.md. Freeze the exact logical-call-plus-OperationId identity, three immutable effect variants and hash input, terminal decision/cause union, fresh-only and terminal approval_required rules, revalidation/refusal matrix, operation-ID reuse, dispatcher order, wait owner release, injected-port duties, and downstream ownership exclusions.
2. Extend the byte owner to count and hash the new reviewed block and complete document without changing existing instruction, additional-context, or namespace bytes.
3. Add a dedicated repository-policy parser/validator and mutation owner under tests/system/repository-policy. Enforce exact ordered fields and rows, closed unions, expiry/disconnect/cancellation/late-decision behavior, stale revalidation, operation-ID boundaries, no reused/resumable authority, and exact wait release/ownership rules.
4. Run only focused policy owners and scoped formatter, linter, TypeScript, and diff checks. Every Bun/Node/tsc/Oxlint command will run sequentially in a named transient systemd user service with 6G memory and 1G swap limits, explicit cwd, verified cgroup, and recorded peak memory.
5. Record scoped evidence and preserved-work audit, commit the coherent policy-only change, leave the task In Progress with acceptance criteria unchecked, and send the required READY_FOR_REVIEW callback with the fixed base and complete range.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the policy-only contract from exact base 34a37f9d5a0ea0a9a87b1843d6645a58c49c6a92. The new strict manifest freezes the exact logical-call-plus-OperationId identity, three parsed effect variants, effective self-fork boundary, opaque caller/target/context authority, SHA-256 input and 90-second expiry, person versus host terminal decisions, deterministic cancellation/disconnect/expiry/stale paths, terminal no-resume approval_required, OperationId reuse and retirement, dispatcher order, wait owner release, five injected port duties, and downstream ownership. The seven-family src/runtime/codex-approvals broker remains excluded.

Repository enforcement adds a typed fixed policy, validator, and mutation owner. The existing byte owner now counts 25 strict JSON fences and pins complete contract SHA-256 8c6a279a1c6a543d8a173cf12b6977477d522b0d0f3f9c4189d4a8430639661a plus dynamic policy SHA-256 d11a60e423f4a0f0fc80f229987d7f0f726bf83a328878913b7b9ef358a84327; all pre-existing instruction, additional-context, classifier, and namespace digests remain unchanged.

Final named systemd user services all used --pipe --wait --collect, MemoryMax=6G, MemorySwapMax=1G, explicit repository cwd, and printed their service cgroup. archboard-task1430119-focused-final-1543 passed 15 tests and 326 expectations at 31.7M peak; archboard-task1430119-tsc-final-1544 passed at 1.7G; archboard-task1430119-oxlint-final-1545 passed with 0 warnings/errors at 349.9M; archboard-task1430119-format-final-1546 passed at 377.7M; archboard-task1430119-inventory-final-1547 passed 39 tests and 69 expectations at 39.5M. Every final service used 0B swap. git diff --check passed. The first type-check attempt could not start because node_modules was absent; a frozen-lockfile install ran in archboard-task1430119-install-1528 at 24.8M, changed neither package.json nor bun.lock, and the unchanged final type command passed. Broad repository, module, browser, and fingerprint lanes were intentionally not run.

Preserved-work audit: only this task record and its recorded document/repository-policy ownership changed. Runtime, browser DTO, dispatcher, UI, gateway, composition, package, lock, generated protocol, sibling tasks, statuses, and acceptance boxes are unchanged. Protected untracked src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.19 remains In Progress with acceptance criteria unchecked for independent review.
<!-- SECTION:NOTES:END -->
