---
id: TASK-148.06
title: Drive Codex process grace tests with the manual scheduler
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 277000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex process tests retain real child and process-group behavior while their module timing advances through the injected scheduler instead of waiting for the full termination grace period.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Module tests use the existing injected now, schedule, and cancel dependencies plus the manual scheduler instead of waiting the full CODEX_TERM_GRACE_MS.
- [ ] #2 Focused coverage retains resistant descendant TERM-to-KILL escalation, stream and leader settlement, and exact cleanup.
- [ ] #3 Focused duration evidence confirms the eliminated five-second grace wait without changing production grace behavior.
<!-- AC:END -->
