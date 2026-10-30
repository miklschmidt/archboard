---
id: TASK-559.10
title: Stop reading whole models for small questions
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
labels:
  - server
  - frontend
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 982000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A click reads 3,810 KB and a window focus 8,816 KB on this repository, one whole-model watcher polls per socket, and drawing keys hold the complete model. A person feels this as jank in every slice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A selection reads its subject without downloading the model
- [ ] #2 History rows load on request
- [ ] #3 One watcher serves each vault, and activity watchers stop when nothing follows them
- [ ] #4 Drawing keys hold a digest and a complete list of what the drawing depends on
- [ ] #5 An open idle tab costs the server no more than a few percent of one core, and a first draw of the root finishes in less than 500 ms in a browser
<!-- AC:END -->
