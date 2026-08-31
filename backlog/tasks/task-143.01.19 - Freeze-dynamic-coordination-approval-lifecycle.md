---
id: TASK-143.01.19
title: Freeze dynamic coordination approval lifecycle
status: Done
assignee:
  - '@codex'
created_date: '2026-08-31 14:25'
updated_date: '2026-08-31 15:48'
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
- [x] #1 The authored contract defines one closed dynamic-approval request identity and immutable effect union for create_thread, fork_thread, and send_message_to_thread, including caller, target, effective self-fork boundary, parsed arguments, bounded visual summary, canonical effect hash, created time, expiry, and one host OperationId.
- [x] #2 Decision outcomes are exactly approved, declined, expired, cancelled, and disconnected; every outcome has a deterministic no-effect or revalidation path, and approval_required is a terminal no-resume tool result that leaves no pending card or reusable authority.
- [x] #3 The contract fixes dispatcher order and refusal mapping: validate and classify, issue operation IDs, await one fresh approval, revalidate exact caller, target, effect, and context, stage each local transaction, attempt each remote mutation once, settle durable provenance, and respond once.
- [x] #4 Repository-policy tests parse and pin the closed policy and independently reject missing, extra, reordered, duplicated, or changed identity fields, effect fields, outcomes, refusal mappings, expiry and disconnect behavior, operation-ID boundary rules, and any approval_required resume path.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one strict, versioned dynamic-coordination approval manifest to docs/design/codex-workbench-authored-contracts.md. Freeze the exact logical-call-plus-OperationId identity, three immutable effect variants and hash input, terminal decision/cause union, fresh-only and terminal approval_required rules, revalidation/refusal matrix, operation-ID reuse, dispatcher order, wait owner release, injected-port duties, and downstream ownership exclusions.
2. Extend the byte owner to count and hash the new reviewed block and complete document without changing existing instruction, additional-context, or namespace bytes.
3. Add a dedicated repository-policy parser/validator and mutation owner under tests/system/repository-policy. Enforce exact ordered fields and rows, closed unions, expiry/disconnect/cancellation/late-decision behavior, stale revalidation, operation-ID boundaries, no reused/resumable authority, and exact wait release/ownership rules.
4. Run only focused policy owners and scoped formatter, linter, TypeScript, and diff checks. Every Bun/Node/tsc/Oxlint command will run sequentially in a named transient systemd user service with 6G memory and 1G swap limits, explicit cwd, verified cgroup, and recorded peak memory.
5. Record scoped evidence and preserved-work audit, commit the coherent policy-only change, leave the task In Progress with acceptance criteria unchecked, and send the required READY_FOR_REVIEW callback with the fixed base and complete range.

6. Review remediation: add logical_call_no_longer_executing -> invalid_call to the closed stale-approved refusal table and prove the approval/cancellation race retires IDs without an effect.
7. Preserve active self-fork by narrowing the busy revalidation condition to non-self fork and send targets.
8. Make decidedAtMs host-issued at terminal compare-and-set and bind person acceptance and expiry to that same host clock observation.
9. Add TASK-143.01.21 to TASK-143.03.07 through Backlog CLI, rerun the focused capped gates, commit, and return the full fixed-base range for rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the policy-only contract from exact base 34a37f9d5a0ea0a9a87b1843d6645a58c49c6a92. The new strict manifest freezes the exact logical-call-plus-OperationId identity, three parsed effect variants, effective self-fork boundary, opaque caller/target/context authority, SHA-256 input and 90-second expiry, person versus host terminal decisions, deterministic cancellation/disconnect/expiry/stale paths, terminal no-resume approval_required, OperationId reuse and retirement, dispatcher order, wait owner release, five injected port duties, and downstream ownership. The seven-family src/runtime/codex-approvals broker remains excluded.

Repository enforcement adds a typed fixed policy, validator, and mutation owner. The existing byte owner now counts 25 strict JSON fences and pins complete contract SHA-256 8c6a279a1c6a543d8a173cf12b6977477d522b0d0f3f9c4189d4a8430639661a plus dynamic policy SHA-256 d11a60e423f4a0f0fc80f229987d7f0f726bf83a328878913b7b9ef358a84327; all pre-existing instruction, additional-context, classifier, and namespace digests remain unchanged.

Final named systemd user services all used --pipe --wait --collect, MemoryMax=6G, MemorySwapMax=1G, explicit repository cwd, and printed their service cgroup. archboard-task1430119-focused-final-1543 passed 15 tests and 326 expectations at 31.7M peak; archboard-task1430119-tsc-final-1544 passed at 1.7G; archboard-task1430119-oxlint-final-1545 passed with 0 warnings/errors at 349.9M; archboard-task1430119-format-final-1546 passed at 377.7M; archboard-task1430119-inventory-final-1547 passed 39 tests and 69 expectations at 39.5M. Every final service used 0B swap. git diff --check passed. The first type-check attempt could not start because node_modules was absent; a frozen-lockfile install ran in archboard-task1430119-install-1528 at 24.8M, changed neither package.json nor bun.lock, and the unchanged final type command passed. Broad repository, module, browser, and fingerprint lanes were intentionally not run.

Preserved-work audit: only this task record and its recorded document/repository-policy ownership changed. Runtime, browser DTO, dispatcher, UI, gateway, composition, package, lock, generated protocol, sibling tasks, statuses, and acceptance boxes are unchanged. Protected untracked src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.19 remains In Progress with acceptance criteria unchecked for independent review.

Review remediation closes all four parent findings. The stale-approved table now maps logical_call_no_longer_executing to invalid_call and the mutation owner rejects approval_required for that cancellation or interruption race; operation IDs retire and no effect runs. Busy now applies only to non-self fork or send targets that became active, preserving active self-fork. The host now stamps decidedAtMs during the terminal compare-and-set, and the same host nowMs observation deterministically selects person acceptance before expiresAtMs or expiry at and after it; browser-supplied timestamps and split-clock acceptance are rejected. TASK-143.03.07 now depends on TASK-143.01.21 through Backlog CLI.

Remediation byte evidence supersedes the earlier changed-block digests: complete contract SHA-256 is 97f45a526ac5e8fbe4de1fa916c3a16584e5d20f5817cfb1ff9c92162ff54f10 and dynamic policy SHA-256 is c1140c7ab6e7627b1efc3e680266db4ceff87b6b79e8ef00c45a81ad87a6e8d5. Final capped services: archboard-task1430119-remediation-focused-tests-1612 passed 15 tests and 340 expectations at 36.2M peak; archboard-task1430119-remediation-tsc-1613 passed at 1.6G; archboard-task1430119-remediation-oxlint-1614 passed with 0 warnings and 0 errors at 347.2M; archboard-task1430119-remediation-format-check-1615 passed at 379M; archboard-task1430119-remediation-inventory-1616 passed 39 tests and 69 expectations at 40.4M. Every service printed its cgroup and used 0B swap. Scoped formatting write also passed in archboard-task1430119-remediation-format-test-1602 at 35M. Broad lanes remain intentionally excluded. The task remains In Progress with all acceptance criteria unchecked for independent rereview.

Final acceptance evidence at clean reviewed HEAD 777c70ad08a79ec91d368294a069773a69f7964b: AC1 is proven by the strict request manifest with ordered logical-call identity plus host OperationId, immutable parsed create, fork, and send effects, self-fork boundary, bounded visual summary, canonical SHA-256 input, created time, and 90-second expiry. AC2 is proven by the exact five-outcome decision and cause tables, same-host terminal timestamp rule, deterministic no-effect or approved revalidation paths, terminal non-resumable approval_required cleanup, and operation-ID retirement. AC3 is proven by the ordered revalidation/refusal matrix, operation-boundary reuse table, and twelve-step dispatcher sequence with one staged local transaction, one remote attempt, one durable settlement, one canonical result, and one response attempt. AC4 is proven by the independent parser, fixed policy, byte pins, and mutation owner that rejects field, effect, outcome, refusal, expiry, disconnect, operation-ID, dispatcher, and resume drift.

Final verification evidence remains the capped remediation run: 15 focused contract tests with 340 expectations, TypeScript, scoped Oxlint with 0 warnings and 0 errors, scoped format, 39 inventory tests with 69 expectations, and git diff --check all passed. Independent parent rereview reported REVIEW_CLEAN for fixed range 34a37f9d5a0ea0a9a87b1843d6645a58c49c6a92..777c70ad08a79ec91d368294a069773a69f7964b. No broad lanes were required for this authored-policy leaf.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Authored and byte-pinned the closed dynamic create, fork, and send approval lifecycle, including immutable effects, host-owned terminal decisions, exact stale refusal and self-fork behavior, operation-ID boundaries, deterministic dispatcher ordering, and terminal no-resume cleanup. Independent mutation owners and byte checks passed 15 focused tests with 340 expectations; TypeScript, scoped lint and format, repository inventory, diff checks, and parent rereview also passed.
<!-- SECTION:FINAL_SUMMARY:END -->
