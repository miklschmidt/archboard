---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 17:38'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.02
  - TASK-143.05.03
  - TASK-143.07.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-workhorse-queue
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own coordinator-to-workhorse queue policy and the sole typed queue RPC port. It exposes the six literal 0.151.0 operations and serializes Archboard commands before authoritative reconciliation. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The contract exposes only add, list, update, delete, reorder, and start; UI Edit maps to update and Cancel maps to delete, with no additional operation or synthetic revision field.
- [x] #2 add/update use the literal UserInput text shape and host-minted clientUserMessageId where required; delete/start use queuedSubmissionId, reorder uses the complete ordered ID array, and list exhausts authoritative pages with repeated-cursor detection.
- [x] #3 The host serializes Archboard-issued mutations per coordinator and immediately reconciles each result with authoritative queue pages; concurrent server activity yields outcome_unknown plus the fresh list instead of guessed success.
- [x] #4 Mutations require exact current coordinator/workhorse links. Tests cover all six bodies, UI mappings, serialization, reconciliation, concurrent activity, stale links, pagination, and uncertainty.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a closed public queue contract for exactly list, add, update, delete, reorder, and start, bound to the current coordinator/workhorse link and a narrow host-owned OperationId authority.
2. Build the literal 0.151.0 request bodies from validated prompts and issued identities; keep UI-facing edit/delete semantics as update/delete and never add a revision or alternate operation.
3. Serialize all commands through the bound coordinator queue, exhaust queue/list pages with a fixed authoritative page size, reject repeated cursors and duplicate identities, and return immutable fresh snapshots.
4. Reconcile every mutation against its authoritative pre-mutation snapshot and returned evidence; return delivered/not_delivered only for attributable outcomes, and return outcome_unknown with the fresh list for concurrent or lost outcomes without retrying.
5. Add focused public-boundary fixtures covering all six bodies, identity/link validation, serialization, pagination, reconciliation, UI operation mappings, stale links, concurrent activity, and uncertainty.
6. Run the focused suite, scoped type/lint/format and repository boundary checks, audit the diff, and commit only the named queue module plus its task metadata.

7. Capture the exact current coordinator/workhorse binding synchronously at every public call, pass it through serialized execution, and refuse it before any queued RPC if the link changes.

8. Remove all OperationId string defaults and infer the identity brand from the required host operation port; add compile-time proof for opaque and future canonical OperationId values.

9. Add deterministic binding-drift coverage proving a queued request makes zero RPCs after replacement, while preserving the reviewed six-operation behavior.

10. Run the remediation-focused tests, compile fixture, scoped type/lint/format/diff checks, audit preserved files, and commit for rereview without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed six-operation coordinator workhorse queue port with literal UserInput and queue RPC bodies, host-owned operation identity validation, exact current-link checks, serialized commands, exhaustive authoritative pagination, and before/after reconciliation that preserves not_delivered or returns outcome_unknown with a fresh list without retry. Focused validation under named systemd user services with MemoryMax=6G and MemorySwapMax=1G (cgroup paths printed): bun test --isolate src/runtime/codex-workhorse-queue/tests passed 15 tests and 43 expectations; bunx tsc --noEmit passed; bunx oxlint src/runtime/codex-workhorse-queue passed with 0 warnings/errors; bunx oxfmt --check src/runtime/codex-workhorse-queue passed; tests/system/repository-policy/test-inventory.test.ts passed 39 tests and 69 expectations. The targeted repository boundary harness reached the mandated 6G+1G cap while spawning its subprocesses and was not rerun. Protected canonical root bundle remained at sha256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with acceptance criteria unchecked pending independent review.

Review remediation implemented from 2cba2ce39189f830d9336173cd97b51ce776f26e: public queue calls now capture a frozen exact coordinator/workhorse binding before enqueue and revalidate it immediately after dequeue, so replaced links produce stale_link with zero RPCs; the factory and all public OperationId-bearing types no longer default to string and infer the identity brand from the required host operation port. Added deterministic queued-binding drift coverage and an opaque OperationId compile fixture, including a TASK-143.01.20-compatible stand-in. Final remediation validation under named systemd user services with MemoryMax=6G and MemorySwapMax=1G (cgroup paths printed): bun test --isolate src/runtime/codex-workhorse-queue/tests passed 16 tests and 46 expectations; bunx tsc --noEmit passed; bunx oxlint src/runtime/codex-workhorse-queue passed with 0 warnings/errors; bunx oxfmt --check src/runtime/codex-workhorse-queue passed; git diff --cached --check passed. The known repository boundary harness cap remains preserved and was not rerun. Task remains In Progress with acceptance criteria unchecked pending rereview.

Finalization evidence: the parent’s independent review returned REVIEW_CLEAN for the complete range 7e878e29b5dbb464ef12d72be0ca5db23c79efb3..e5684b2d785d9bae878cfbf7489ec452b63eab4d. AC #1 is directly covered by the exact six-operation/no-revision and UI edit-to-update/cancel-to-delete tests; AC #2 by literal add/update/delete/reorder/start bodies, UserInput shape, host serialization, complete reorder, page exhaustion, and repeated-cursor tests; AC #3 by serialized mutation ordering, before/after authoritative reconciliation, concurrent-activity unknown outcomes, lost-response no-retry, and known not-delivered tests; AC #4 by exact link/epoch validation, stale-link race coverage, and the new acceptance-time queued-binding drift test proving zero RPCs. The opaque OperationId compile fixture and passing root TypeScript check prove the inferred brand seam. The known repository-boundary 6G+1G OOM limitation remains documented and was not rerun; the protected root bundle hash remains unchanged. All four acceptance criteria are now checked; no Definition of Done items exist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the typed six-operation coordinator workhorse queue policy with exact link capture, serialized authoritative reads/mutations, literal queue bodies, uncertainty-safe reconciliation, and host-inferred OperationId branding. Verified all four acceptance criteria with 16 focused tests/46 assertions, the opaque OperationId compile fixture, passing TypeScript, Oxlint, Oxfmt, and diff checks, plus an independent REVIEW_CLEAN. The known repository-boundary 6G+1G OOM limitation was preserved and not rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
