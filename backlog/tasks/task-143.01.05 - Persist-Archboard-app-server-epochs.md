---
id: TASK-143.01.05
title: Persist Archboard app-server epochs
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 03:00'
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
<!-- SECTION:NOTES:END -->
