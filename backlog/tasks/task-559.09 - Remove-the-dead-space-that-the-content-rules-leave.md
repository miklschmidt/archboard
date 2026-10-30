---
id: TASK-559.09
title: Remove the dead space that the content rules leave
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
labels:
  - renderer
dependencies:
  - TASK-559.02
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 981000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw obscene dead space in Blocks. The content rules remove most of it, so renderer work must start from what they leave, and it must keep every geometry guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Local compaction and candidates ranked by fit are measured on the merged core and on the content of the design
- [ ] #2 Names, paths, arrows and essential labels stay readable, and no reading regresses on a guard
- [ ] #3 The grading corpus of Gate 6 passes in the real pane
<!-- AC:END -->
