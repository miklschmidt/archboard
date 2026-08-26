---
id: TASK-127
title: Restore a snapshot in one atomic board write
status: To Do
assignee: []
created_date: '2026-08-26 07:06'
labels:
  - enhancement
dependencies: []
references:
  - TASK-123.01
  - TASK-048
  - TASK-003
  - TASK-059
  - src/cli/commands/snapshot.ts
  - src/runtime/engine/scene-document.ts
  - scripts/check-one-write.mjs
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Snapshot restore currently clears the target board and then batches the saved scene through the current snapshot and scene owners. That creates a two-write gap for one restore act. Deliver an atomic snapshot replacement while retaining the command's exact board identity selection and force behavior. TASK-048, TASK-003, and TASK-059 cover adjacent snapshot guarantees and are not duplicates of this write-boundary defect. This is tracking work discovered by TASK-123.01; do not implement it there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A snapshot restore performs exactly one board content write, as asserted by the one-write test harness.
- [ ] #2 Restore keeps the exact existing board identity selection and force semantics, with no observable cleared-board gap.
- [ ] #3 The atomic path preserves required doing narration, claims, board versions, optimistic note safety, and deep-copy isolation.
<!-- AC:END -->
