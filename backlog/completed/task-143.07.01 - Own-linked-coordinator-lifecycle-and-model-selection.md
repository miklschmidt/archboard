---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 16:23'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.07.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-coordinator
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one persistent current-epoch coordinator using the literal reviewed ThreadStartParams profile, exhaustive model selection, exact settings handshake, and restart/reuse policy. It remains capable under ordinary tools/approvals; sustained-work delegation is policy, not a capability restriction. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 model/list is exhausted and gpt-5.6-luna with medium effort is required; absence refuses. Priority is included only when advertised, otherwise omitted with visible configured/effective state.
- [x] #2 Thread start exactly matches the authored coordinator profile: checkout cwd/root, paginated persistence, startup/archboard source, instructions, realtime config, eager catalogues, model, and every intentional omission.
- [x] #3 The one settings update and matching notification prove model, effort, and tier while preserving start-response approvalPolicy, approvalsReviewer, sandbox as notification sandboxPolicy, and activePermissionProfile; none is renamed permissions.
- [x] #4 Only a matching loaded controllable current-epoch coordinator with reviewed hashes/settings is reusable; others are inspect-only or replaced through the staged transaction.
- [x] #5 Normal web, shell, repository, approval, and bounded board capabilities remain available while instructions default sustained code work to delegation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile public session, epoch, thread-link, authored-instruction, and tool-catalogue contracts into a strict coordinator port with injected notification handling and no local identity synthesis.
2. Implement exhaustive model selection and the exact reviewed coordinator ThreadStartParams profile, followed by one settings update and a matching notification handshake that exposes configured/effective state while preserving approval, reviewer, sandbox, and permission-profile fields.
3. Implement current-epoch reuse/replacement policy: reuse only a loaded controllable matching thread; classify all other candidates as inspect-only or replace through one staged epoch transaction with deterministic lost-response/no-retry outcomes.
4. Add focused fake-port tests covering paging, model/priority decisions, exact start/settings contracts, stale and mismatched reuse, hash drift, replacement, transaction loss, and capability preservation.
5. Run only sequential transient 6G/1G focused validation plus scoped type/lint/format/diff checks, audit preserved work, commit the coherent change, and leave this task In Progress with acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final verification at fixed HEAD 19680bd1e0029a938850be05d4acc4f704223425 from BASE 34a37f9d5a0ea0a9a87b1843d6645a58c49c6a92:
- AC1: focused model tests exhaust model/list pages, require gpt-5.6-luna with medium effort, refuse absence/ambiguity/unsupported effort/repeated cursors, and verify advertised versus omitted priority with visible configured/effective state.
- AC2: focused lifecycle/model tests assert the exact authored ThreadStartParams profile and intentional omissions for priority and fallback.
- AC3: focused lifecycle tests assert one settings update, exact matching notification, preserved approval/reviewer/sandbox/permission-profile fields, timeout quarantine, and mismatch-then-exact recovery.
- AC4: focused reuse/lifecycle tests cover current-epoch loaded controllable reuse, stale/not-loaded/uncontrollable/hash-drift replacement or inspection, staged transactions, and no-retry unknown outcomes.
- AC5: focused lifecycle test asserts web, shell, repository, approvals, and bounded-board capabilities remain true with sustained work as instruction policy.
- Validation: finalization focused suite passed 23 tests and 131 assertions under archboard-coordinator-finalization-tests-6G.service (71.6M peak); prior fixed-range scoped type-check, lint, format, and diff checks passed under named capped services.
- Preserved limitation: the reviewer-run module-scope repository-policy owner OOM-killed at the mandated 6G memory plus 1G swap cap; it was not rerun and is not reported as passing.
- Worktree was clean and the fixed range contained only the reviewed coordinator implementation/tests and required task metadata.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the reviewed coordinator lifecycle, model selection, exact authored start/settings contracts, current-epoch reuse/replacement policy, and bounded non-rejecting settings settlement. Verified all five acceptance criteria with focused fake-port tests and scoped type, lint, format, and diff checks. Preserved the documented module-scope repository-policy OOM at the mandated 6G+1G cap; no broad or browser lanes were rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
