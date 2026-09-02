---
id: TASK-148.09
title: Reuse Codex epoch storage-failure scaffolding
status: To Do
assignee: []
created_date: '2026-09-02 23:00'
labels: []
dependencies: []
references:
  - codex-epoch/tests/storage-failure.test.ts
  - storage-failure-support.ts
parent_task_id: TASK-148
ordinal: 281000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The storage failure matrix rebuilds 72 fsync-backed temporary roots although only injected failure phase, transition, and target vary. Preserve the full reachable failure matrix while separating durable setup from injected failure and avoiding repeated real filesystem scaffolding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All distinct transition, target, and atomic failure-phase behaviors remain covered with the same observable recovery/refusal assertions.
- [ ] #2 Durable root creation and fsync-backed epoch setup are reused or replaced by the cheapest credible injected boundary; the test no longer creates a complete durable root for every matrix row.
- [ ] #3 The focused owner improves materially from the recorded 7.17 seconds and leaves no temp roots or process residue.
<!-- AC:END -->
