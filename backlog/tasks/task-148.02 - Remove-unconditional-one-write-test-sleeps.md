---
id: TASK-148.02
title: Remove unconditional one-write test sleeps
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 273000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One-write owners observe completion directly while preserving the exact wire-write count that protects atomic board mutations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Element-ops, snapshot, import-replace, and apply one-write owners replace their fixed 1 s, 80 ms, and 150 ms sleeps with observable completion.
- [ ] #2 Each changed owner retains its exact wire-write count and atomic outcome assertions.
- [ ] #3 Focused duration evidence shows timing sleeps are not used as success signals.
<!-- AC:END -->
