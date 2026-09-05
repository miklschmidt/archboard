---
id: TASK-150.01.02.01
title: Repair strict Codex runtime contracts
status: Done
assignee: []
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 14:27'
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
Deferred to TASK-151. Preserve all committed and uncommitted corrections in this historical repair scope. Remaining non-UI strict-rule adoption is outside TASK-150 and does not block the UI rebuild.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing corrections remain intact.
- [x] #2 Remaining non-UI adoption is owned by TASK-151; this historical leaf does not block TASK-150 UI construction.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Do not resume this repair leaf during TASK-150. TASK-151 owns any later non-UI adoption after its scope is agreed. Preserve current changes and user-deleted tests. Historical evidence remains for context only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compiler-first checkpoint on HEAD eaad7c73: repaired explicit undefined lifecycle slots and absent optional-field construction across approvals, dynamic tools, epoch fixtures, process/storage, session fixtures, thread-link fixtures, transport, operations fixtures, and workhorse queue. Focused non-browser module evidence: 205 tests across approvals/process/dynamic-tools/transport/queue passed; 126 tests across epoch/thread-link/session/workhorse-operations passed; git diff --check passed. No suppression, configuration, browser, archive, staging, or commit action. Protocol Zod failures require a shared conformance normalization at src/shared/codex-app-server-contract/index.ts and were routed to the coordinator rather than weakened locally. Scoped Oxlint proves a large remaining pre-existing applicable lint inventory, so the leaf is not terminal and needs continued repair after primary compiler refresh.

Continuation checkpoint on shared HEAD f9abd7cb: primary shared JSON conformance normalization reduced owned compiler diagnostics from 58 to 24. Repaired all independent exact-optional diagnostics reported outside protocol shape owners, including preserving the unproved-created-root fixture by constructing a proof-free target rather than assigning undefined. Type-aware lint is clean for codex-process environment and codex-transport internals; diagnostics reduced to two readonly-typed-array boundary reports requiring contract judgment. Focused continuation validation: 101 tests initially passed with one semantic fixture regression detected; corrected proof omission and reran owned-created-root with 4/4 passing. No broad gate/browser/staging/commit.

Approved cleanup-only extraction implemented: new codex-process/lib/process-group-cleanup.ts owns proof-aware TERM/KILL settlement and canonical deadline waits through injected existing sanitized failure capabilities; process.ts retains generation/readiness/restart/storage/publication plus sole group promise dedup and group-set mutation. Full codex-process module tests pass 51/51. process.ts reduced 1435 -> 1282 lines; helper is 260 lines, so <=500 remains explicitly incomplete. New helper still has strict lint work and is not frozen for commit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deferred to TASK-151 by user decision; existing corrections are preserved in commit a7fef61d and do not block UI construction.
<!-- SECTION:FINAL_SUMMARY:END -->
