---
id: TASK-148.01
title: Make board-lock timing tests deterministic
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lock-test owners prove lease expiry, renewal, refusal, recovery, and peer teardown without consuming production lease or retry durations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focused board-claim, board-lock-announcements, board-lock-api, and resource-cleanup lease-expiry owners use deterministic control or observable synchronization instead of real lease or retry waiting.
- [ ] #2 Lock expiry, renewal, refusal, recovery, and real peer teardown behavior remain asserted, with focused duration evidence recorded.
- [ ] #3 The resource-cleanup 3100 ms lease wait is removed; any retained OS TERM-to-KILL physical-time proof stays under four seconds behind a source-local TEST_* outer bound.
- [ ] #4 No production timing value changes.
<!-- AC:END -->
