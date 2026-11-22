---
id: TASK-663.10
title: Lines draw thicker, and their head and dash say the effect
status: To Do
assignee: []
created_date: '2026-11-22T14:12:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
At opening zoom, gray hairlines with hollow heads and fine dots could not be read (settled.md points 1, 8, 9, 10; owner: lines thicker in general, mixed rails of little value).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mutation is solid with a filled triangle; query dashed, compute dotted and declared-only dash-dot, each with an open chevron
- [ ] #2 Every line draws thicker than before, and heads keep a minimum on-screen size
- [ ] #3 The mixed-kinds rail line and its legend mark are retired
- [ ] #4 The exported legend and the status line above an export use the same marks
- [ ] #5 Packages and Painting at opening zoom in both themes are judged by screenshots in the PR
<!-- AC:END -->
