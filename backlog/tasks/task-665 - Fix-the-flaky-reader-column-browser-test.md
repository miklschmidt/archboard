---
id: TASK-665
title: Fix the flaky reader-column browser test
status: To Do
assignee: []
created_date: '2026-11-22T13:35:00Z'
labels:
  - bug
dependencies: []
ordinal: 1153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/browser/reader-column.test.ts ("Code shows the focused pane's addressed file…") fails about 1 run in 6 with "Wait timed out after 25000ms", with or without the 2026-11-22 toast-scroll fix. Flakes cost CI reruns and hide real failures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The root cause is named with file and line evidence
- [ ] #2 The test passes 100 repeated runs under parallel load
- [ ] #3 No timeout is raised and no retry is added to hide it
<!-- AC:END -->
