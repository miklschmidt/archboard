---
id: TASK-148.04
title: Replace cross-process lock sleeps with synchronization
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 275000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cross-process lock owners synchronize on watcher and lease observations instead of arbitrary elapsed delays, keeping the integration facts they actually prove.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The arbitrary 1200 ms, 1500 ms, and 1200 ms cross-process lock delays are replaced with explicit watcher or lease observations.
- [ ] #2 Coverage retains ownership, expiry or handoff, and cleanup behavior.
- [ ] #3 A real elapsed wait remains only when it proves a genuine integration fact; its reason, measurement, and TEST_* outer bound are documented locally.
- [ ] #4 Cross-process watcher delivery is measured after raw sleeps move to observable conditions before any waiver is considered.
<!-- AC:END -->
