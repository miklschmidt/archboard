---
id: TASK-150.01.02.01
title: Repair strict Codex runtime contracts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 04:44'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/strict-analysis.md
  - docs/design/task-150-quarantine.md
parent_task_id: TASK-150.01.02
priority: high
type: task
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore strict compiler and lint confidence in retained src/runtime/codex-* modules and their owned tests after the TS4111 checkpoint f9cee0b09d6630693412abb31d9763e8e4ae9a86. Exact optional values, schema contracts, returns and input immutability must be repaired at owning interfaces while preserving private-session, authority, queue and lifecycle behavior. Visible Daybreak low implementation only; shared checkout and named scope prevent overlap. Primary repair owner retains configuration, package/generator/shared contracts and the sole broad validation lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Assigned runtime modules pass full applicable strict compiler and lint policy without weakened rules, unsafe fallback types or unapproved suppressions.
- [ ] #2 Relevant module contracts preserve observable lifecycle, delivery, authority, queue, approval and failure behavior; focused non-browser checks pass.
- [ ] #3 Changes stay within src/runtime/codex-* and their owned tests; external contract changes are coordinated, no archived logic is ported, and no browser test executes.
- [ ] #4 Report fixed HEAD, focused evidence, any justified local exceptions and risks to TASK-150 coordinator; commits are serialized by coordinator and formal terminal reconciliation waits for final review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repair exact-optional ownership and unreachable/unused compiler failures in retained codex runtime modules.
2. Repair authored Zod protocol conformance without weakening generated-wire guarantees.
3. Run scoped lint and focused non-browser module tests, then record evidence and callback to the coordinator.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compiler-first checkpoint on HEAD eaad7c73: repaired explicit undefined lifecycle slots and absent optional-field construction across approvals, dynamic tools, epoch fixtures, process/storage, session fixtures, thread-link fixtures, transport, operations fixtures, and workhorse queue. Focused non-browser module evidence: 205 tests across approvals/process/dynamic-tools/transport/queue passed; 126 tests across epoch/thread-link/session/workhorse-operations passed; git diff --check passed. No suppression, configuration, browser, archive, staging, or commit action. Protocol Zod failures require a shared conformance normalization at src/shared/codex-app-server-contract/index.ts and were routed to the coordinator rather than weakened locally. Scoped Oxlint proves a large remaining pre-existing applicable lint inventory, so the leaf is not terminal and needs continued repair after primary compiler refresh.

Continuation checkpoint on shared HEAD f9abd7cb: primary shared JSON conformance normalization reduced owned compiler diagnostics from 58 to 24. Repaired all independent exact-optional diagnostics reported outside protocol shape owners, including preserving the unproved-created-root fixture by constructing a proof-free target rather than assigning undefined. Type-aware lint is clean for codex-process environment and codex-transport internals; diagnostics reduced to two readonly-typed-array boundary reports requiring contract judgment. Focused continuation validation: 101 tests initially passed with one semantic fixture regression detected; corrected proof omission and reran owned-created-root with 4/4 passing. No broad gate/browser/staging/commit.
<!-- SECTION:NOTES:END -->
