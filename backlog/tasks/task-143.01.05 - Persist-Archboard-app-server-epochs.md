---
id: TASK-143.01.05
title: Persist Archboard app-server epochs
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 04:41'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.04
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-epoch
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the host epoch manifest and serialized compare-and-swap transaction records outside both Codex stores. It records confirmed ownership and inspect-only uncertainty; it never guesses a thread from recency.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Epoch startup stages a new operation record, fsyncs and atomically commits the active epoch, and compare-and-swaps all later link/create/fork mutations against the same child and operation identity.
- [x] #2 Records distinguish staged, committed, rolled_back, and inspect_only tombstone outcomes and retain confirmed thread provenance, instruction hash, manifest hash, workspace root, and operation correlation.
- [x] #3 A lost non-idempotent response is outcome_unknown and creates an inspect-only tombstone; replacement children cannot resume, delete, infer, or execute that thread.
- [x] #4 Crash/restart tests cover every fsync boundary, stale writer, conflicting process, corrupted manifest, rollback, and preserved evidence without mutating Codex storage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile ADR 0019, the authored epoch/uncertainty contract, completed process ownership, and current atomic-write conventions. 2. Implement one codex-epoch owner for staged/committed/rolled-back/inspect-only records and compare-and-swap mutations bound to child and operation identity. 3. Add crash, fsync-boundary, stale-writer, corruption, rollback, outcome-unknown, replacement-child, and preserved-evidence tests without touching Codex stores. 4. Run focused type/lint/format/diff checks, record immutable evidence, and leave broad module/system/repository lanes to the capped root owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-143.01.04 finalized at integration HEAD 6515ee1. This dependency-ready leaf owns src/runtime/codex-epoch and is path-disjoint from active transport, realtime-boundary, formatter, shell-token, and lint-alias lanes.

Implementation commit 431f18d (based on 6d0f8e562e97eb0b555e27c6abda58ed8f8ff194). Added the module-root codex-epoch owner with a canonical, fsynced twin manifest/journal, atomic publish ordering, durable lock lease, exact child/epoch/operation CAS, staged/committed/rolled_back/inspect_only transitions, outcome_unknown confirmation rules, strict corruption validation, and replacement-child refusal.

Focused evidence: bunx oxlint src/runtime/codex-epoch; bunx oxfmt --check src/runtime/codex-epoch; bunx tsc --noEmit --pretty false; bun test --isolate src/runtime/codex-epoch/tests (14 pass, 126 expectations); git diff --cached --check. Storage-failure tests inject target_stat, temp_open, temp_write, temp_fsync, temp_close, publish, directory_open, directory_fsync, and directory_close in both records-first staging and manifest-first commit. Codex-home and sqlite-home byte/inode/mode/directory sentinels remain unchanged across success, refusal, rollback, replacement, corruption, and injected durability failures. Broad module/system/repository/check/browser lanes were not rerun; the root owner retains those gates. Task remains In Progress and acceptance criteria remain unchecked for independent review.

Review remediation commit 973a3b5 closes the reproduced parent-symlink storage escape, replacement-child tombstone relink, and stale-lock ABA race. Fail-first evidence: archboard-task1430105-failfirst-r1.service produced 3/3 hostile failures with MemoryPeak 13.2M and swap 0B. The earlier durability note is superseded: its matrix exercised only the first-written target for stage and commit, not both targets or rollback/outcome_unknown. Corrected matrix evidence in archboard-task1430105-durability-r2.service covers stage, commit, rollback, and outcome_unknown; first and second targets in records-first and manifest-first order; target_stat through directory_close; exact before/corrupt/after restart state, in-process quarantine, preserved twin evidence, and unchanged Codex-store sentinels: 5 pass, 446 expectations, MemoryPeak 27M, swap 0B. Additional capped evidence: archboard-task1430105-remediation-r1.service 3 pass/12 expectations, MemoryPeak 14.1M, swap 0B; archboard-task1430105-codex-epoch-r1.service 20 pass/510 expectations, MemoryPeak 34.7M, swap 0B; archboard-task1430105-typecheck-r1.service success, MemoryPeak 1.4G, swap 0B; archboard-task1430105-lint-r2.service 0 warnings/errors, MemoryPeak 307.4M, swap 0B; archboard-task1430105-fmtcheck-r1.service success, MemoryPeak 28M, swap 0B; git diff --check clean. Broad module/system/repository/check/browser lanes remain with the capped root owner. Task remains In Progress and all acceptance criteria remain unchecked for independent rereview.

Second rereview remediation commit 9762719 restores the authored outcome_unknown plus exact_positive_correlation to delivered transition. The previous 973a3b5 self-record rule is superseded: the current operation may settle with its own recorded thread and turn, while the unchanged cross-record scan still rejects another inspect_only, prior-child, or prior-epoch record carrying that thread. Fail-first archboard-task1430105-r2-failfirst.service reproduced both regressions after mismatch checks passed: exact same-operation thread settlement and exact initial-turn thread-plus-turn settlement failed with inspect_only, 0 pass/2 fail/4 expectations, MemoryPeak 14.3M, swap 0B. Focused capped evidence: archboard-task1430105-r2-contract-tests.service 5 pass/22 expectations, including retained fresh replacement-child tombstoned-thread refusal, thread mismatch refusal, turn mismatch refusal, exact same-operation thread settlement, and exact initial-turn thread-plus-turn settlement, MemoryPeak 19.6M, swap 0B; archboard-task1430105-r2-codex-epoch.service 20 pass/513 expectations, MemoryPeak 35.1M, swap 0B; archboard-task1430105-r2-typecheck.service success, MemoryPeak 1.4G, swap 0B; archboard-task1430105-r2-lint.service 0 warnings/errors, MemoryPeak 311.9M, swap 0B; archboard-task1430105-r2-fmtcheck.service clean, MemoryPeak 33.1M, swap 0B; git diff --check clean. Broad module/system/repository/check/browser lanes remain with the capped root owner. Task remains In Progress and all acceptance criteria remain unchecked for complete-range rereview.

Root acceptance at integrated HEAD e1ee7d2: independent reviewer returned REVIEW_CLEAN for exact immutable range 6d0f8e562e97eb0b555e27c6abda58ed8f8ff194..a8c272fe50bfc6e296e93d9ac0f43c41bb686515. Root capped epoch unit archboard-task1430105-focused-e1ee7d2.service passed 20 tests and 513 assertions at 34.9M peak with swap 0 under MemoryMax 6G and MemorySwapMax 1G. It directly proves canonical durable twins, child/epoch/operation CAS, every terminal state, exact-positive settlement, cross-record tombstone refusal, parent-symlink and Codex-store isolation, stale-reaper serialization, both twin targets through every atomic failure phase, quarantine, restart evidence, and sentinel preservation. Scoped type/lint/format passed in worker and independent review. The current integration root type gate is separately blocked by two assistant-ui policy test errors already returned to TASK-143.03.12; it does not involve codex-epoch. Previously capped global module/repository lanes were not repeated or granted higher limits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a durable Archboard-owned app-server epoch store outside both Codex stores with atomic twin publication, exact child/epoch/operation compare-and-swap, staged/committed/rolled_back/inspect_only records, outcome-unknown settlement, and permanent cross-record replacement-child quarantine. Review remediation closed canonical-path escapes, stale-lock ABA recovery, tombstone relinking, crash-matrix gaps, and restored same-operation exact-positive settlement. Independent review was clean and the integrated capped epoch suite passed 20 tests and 513 assertions.
<!-- SECTION:FINAL_SUMMARY:END -->
