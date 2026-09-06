---
id: TASK-154
title: Stop tests waiting through product timeouts
status: To Do
assignee: []
created_date: '2026-09-06 14:20'
labels: []
dependencies: []
priority: medium
ordinal: 306000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Many system and browser owners wait for a real product duration to elapse (lock leases, watch intervals, the 90 s approval expiry) and their budgets in the timing module are multiples of product values, so the suite's wall time is set by product timeouts and a product change silently retunes forty test budgets. Each such owner should get an injected clock or a shortened lease so no test sleeps through a product timeout. Origin: the TASK-153 audit of the timing module.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No test owner waits for a real product duration longer than one second to elapse
- [ ] #2 Test budgets are not derived from product durations
- [ ] #3 The complete check's wall time drops and the change is recorded in docs/agents/test-suite.md
<!-- AC:END -->
