---
id: TASK-148.07
title: Enforce an actual per-test wall-clock budget
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies:
  - TASK-143.08.01
  - TASK-148.01
  - TASK-148.02
  - TASK-148.03
  - TASK-148.04
  - TASK-148.05
  - TASK-148.06
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 278000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repository gate rejects unapproved slow test owners based on actual elapsed wall-clock time, without confusing declared timeout caps with elapsed runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A monotonic clock captured before fake timers enforces a 20,000 ms unapproved per-test elapsed-time budget; declared timeout caps that do not win do not fail.
- [ ] #2 Static policy pins preload coverage and validates source-local structured declarations only. It does not ban timeout values or imports.
- [ ] #3 A true real-time owner has a source-local structured reason, TEST_* outer bound, task reference, and evidence; no central filename allowlist or wildcard waiver exists.
- [ ] #4 Positive and negative policy fixtures pass, the old 91-second approval-expiry shape fails, and the legitimate 14.816-second contention owner does not fail.
- [ ] #5 The repository gate enforces the policy.
<!-- AC:END -->
