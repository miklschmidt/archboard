---
id: TASK-538.04
title: The About page and the navigator open a proposal beside the current variant
status: To Do
assignee: []
created_date: '2026-10-25T17:06:00Z'
labels:
  - compare
  - ui
dependencies:
  - TASK-538.02
parent_task_id: TASK-538
type: feature
ordinal: 945000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided on 2026-10-25 to keep TASK-388: the Board tab lists no variants. The About page already lists every variant with its record and shelving reason, and opens one in the same pane. Alt on a navigator row already opens a board beside. Neither keeps the view, and the About page cannot open beside.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The variant timeline of the About page offers to open a draft or a shelved variant beside the variant that the board's name opens
- [ ] #2 Opening beside from the About page or the navigator keeps the view of the pane it came from
- [ ] #3 With one pane, the second pane opens, and a third proposal replaces the pane beside and never adds a pane
- [ ] #4 The Board tab still lists no variants
<!-- AC:END -->
