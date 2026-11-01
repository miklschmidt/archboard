---
id: TASK-559.10
title: Stop reading whole models for small questions
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-10-30T18:43:00Z'
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
- [x] #1 A selection reads its subject without downloading the model
- [x] #2 History rows load on request
- [x] #3 One watcher serves each vault, and activity watchers stop when nothing follows them
- [x] #4 Drawing keys hold a digest and a complete list of what the drawing depends on
- [ ] #5 An open idle tab costs the server no more than a few percent of one core, and a first draw of the root finishes in less than 500 ms in a browser
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A click fell from 3,803 KB to 1 KB, a window focus from 9,374 KB to 1 KB, and an idle tab from 16.9 percent of one core to about 1.2. First draw of the root takes 385 to 465 ms with a stored drawing in 7 of 9 runs, 825 to 1,201 ms without one, and about 1,400 ms on a fresh profile, so the first-draw half of criterion 5 is open. Still open: a locality read of 1.1 MB, code findings poll every 5 seconds, and following a reference reads the whole model. Merging this slice with the accepted scene hid corrections, because a correction keeps the revision and the drawing: fixed in 759c606ce.
<!-- SECTION:NOTES:END -->
