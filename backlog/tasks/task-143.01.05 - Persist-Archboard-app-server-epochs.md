---
id: TASK-143.01.05
title: Persist Archboard app-server epochs
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:58'
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
