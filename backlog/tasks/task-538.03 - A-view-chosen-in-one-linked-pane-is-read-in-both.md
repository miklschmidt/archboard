---
id: TASK-538.03
title: A view chosen in one linked pane is read in both
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
ordinal: 944000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordering and error handling show in a sequence or a flowchart view (ADR 0053). To follow one case through two designs, both panes must read the same view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the panes linked, choosing a view in one pane reads both panes through it, as one history entry
- [ ] #2 Back restores both previous views, and a reload restores both
- [ ] #3 A walkthrough step's view and a drilled level's view are not linked
<!-- AC:END -->
