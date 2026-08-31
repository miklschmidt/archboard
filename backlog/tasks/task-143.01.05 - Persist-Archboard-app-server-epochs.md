---
id: TASK-143.01.05
title: Persist Archboard app-server epochs
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 04:08'
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
- [ ] #1 Epoch startup stages a new operation record, fsyncs and atomically commits the active epoch, and compare-and-swaps all later link/create/fork mutations against the same child and operation identity.
- [ ] #2 Records distinguish staged, committed, rolled_back, and inspect_only tombstone outcomes and retain confirmed thread provenance, instruction hash, manifest hash, workspace root, and operation correlation.
- [ ] #3 A lost non-idempotent response is outcome_unknown and creates an inspect-only tombstone; replacement children cannot resume, delete, infer, or execute that thread.
- [ ] #4 Crash/restart tests cover every fsync boundary, stale writer, conflicting process, corrupted manifest, rollback, and preserved evidence without mutating Codex storage.
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
<!-- SECTION:NOTES:END -->
