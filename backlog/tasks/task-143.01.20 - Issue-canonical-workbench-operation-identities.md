---
id: TASK-143.01.20
title: Issue canonical workbench operation identities
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-31 14:25'
updated_date: '2026-08-31 16:34'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.19
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-workbench-identity
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add one shared branded host-owned OperationId domain for every Archboard workbench mutation correlation. The identity authority mints, validates, parses, and serializes it without borrowing browser-command, JSON-RPC, dynamic-call, approval, thread, or turn domains. TASK-143.01.11, TASK-143.05.04, and TASK-143.07.03 consume this single authority instead of minting strings. Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 OperationId is a distinct opaque branded identity with one host issuer and exact parser and serializer; callers cannot adopt server strings, cast another identity domain, or mint through a second module.
- [ ] #2 Minted operation IDs satisfy the durable epoch token and authored context/result bounds, remain unique within the owned child session, serialize deterministically, and reject empty, malformed, wrong-domain, unissued, or stale values.
- [ ] #3 The public capability split preserves validator, issuer, and trusted decoder authority: ordinary consumers receive only the narrow operation-ID capabilities they need, and server-owned identity adoption remains unavailable.
- [ ] #4 Runtime and compile fixtures prove operation IDs round-trip, cannot interchange with every existing identity domain, cannot be caller-fabricated, and provide the exact reusable type consumed by workhorse start, general dynamic tools, and coordinator workhorse operations.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing shared identity authority with one branded OperationId domain, preserving the single issuer and adding the durable current-child/current-epoch token grammar plus authored UTF-8 bounds.
2. Expose only narrow operation-ID validation, host issuance, and trusted parse/serialization capabilities through the existing authority; reject caller strings, cross-domain values, stale epochs, unissued values, and duplicate issuance without adding an identity module.
3. Add module-root runtime and compiler fixtures proving deterministic round trips, uniqueness, exact public types, operation-ID non-interchangeability with every existing identity, capability negative space, and boundary/refusal behavior.
4. Run focused identity tests, both type graphs, scoped lint and format, repository boundary/module-scope/inventory owners, and diff checks; record evidence while preserving consumer modules, generated assets, sibling tasks, and the protected bundle.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one epoch-bound OperationId domain in the existing shared identity authority. Host issuance uses the current durable child epoch plus a host nonce, loops on in-session collisions, and enforces the 128-byte authored dynamic-result/coordinator bound. Trusted parsing and serialization are exact and refuse malformed, empty, wrong-child, stale-epoch, unissued, and cross-domain values; OperationId is excluded from server-owned Codex adoption and generic Codex serialization. Narrow OperationIdValidator, OperationIdIssuer, and TrustedOperationIdDecoder capability types expose only the needed methods. Runtime fixtures cover round trips, uniqueness, epoch binding, bounds, and refusal behavior; compiler fixtures cover all existing identity domains, caller strings, adoption, and generic serializer separation.

Validation: named service archboard-task1430120-identity-focused-03 passed 9 tests and 402 expectations; archboard-task1430120-typecheck-04 passed both TypeScript projects at 1.7G; archboard-task1430120-scoped-final-01 passed Oxlint with 0 warnings/errors and Oxfmt check; archboard-task1430120-inventory-01 passed 39 tests and 69 expectations; archboard-task1430120-diff-final-01 passed git diff --check. The combined boundaries owner and standalone module-scope owner each reached the 6G/1G cgroup ceiling and were not rerun. Every command used a named transient systemd user service with --pipe --wait --collect, explicit checkout cwd, printed cgroup, MemoryMax=6G, MemorySwapMax=1G, and verified limits.

Preserved-work audit: changed source scope is only src/shared/codex-workbench-identity plus this task record; no consumer modules, generated files, package or lock files, sibling task state, acceptance boxes, or protected bundle changed. The protected src-DlBR1tzg.js path is absent in this isolated worktree. Task remains In Progress with acceptance criteria unchecked for independent review.

Review remediation: OperationId methods were removed from IdentityValidator, IdentityIssuer, and TrustedIdentityDecoder. A separate OperationAuthority is returned under authority.operation, with exact narrow capability interfaces and keyof/@ts-expect-error negative-space fixtures. Operation nonce injection now drives a finite 16-attempt retry budget and returns issuance-exhausted after repeated duplicates; deterministic duplicate-then-fresh and exhaustion tests cover both paths.
<!-- SECTION:NOTES:END -->
