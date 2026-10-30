---
id: TASK-559.07
title: Start on a reading that means something
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.05
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 979000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The product opens on the migration notice of an unrelated repository, and a second pane does the same. The switcher must also handle 312 checkouts on this machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An address, the last reading, or a repository chooser decides the start, and an unrelated repository never opens by default
- [ ] #2 No repository, no model, a planning model and a legacy model each show their own state and action
- [ ] #3 A loading message appears only after a delay, and names the destination
<!-- AC:END -->
