---
id: TASK-342
title: 'A performance pass: every dogfood board lays out in seconds'
status: To Do
assignee: []
created_date: '2026-09-24 16:09'
labels:
  - renderer
  - performance
dependencies: []
priority: high
type: task
ordinal: 583000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-24 in-process, cold, on the dogfood vault: Archboard server takes 107 to 149 s to lay out and Board viewer 12 to 16 s, which makes opening them slow and the wide-boards test owners time out. Before and after today's renderer merges measured the same, so the cost lives in layout itself (label settlement retries, column fold choice, routing passes are candidates), not in today's changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A profile of the slowest boards names where layout time goes
- [ ] #2 Archboard server and Board viewer lay out in a few seconds, and the pictures they draw are unchanged or judged no worse
- [ ] #3 The wide-boards owners pass within their time budget
<!-- AC:END -->
