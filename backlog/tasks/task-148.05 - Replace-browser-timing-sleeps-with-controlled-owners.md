---
id: TASK-148.05
title: Replace browser timing sleeps with controlled owners
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 276000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser coverage keeps rendered user-visible behavior while controlled-clock module owners prove pure scheduling without direct wall-clock sleeps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pure scheduling assertions move from direct 800 ms, 650 ms, 400 ms, 1100 ms, and 400 ms browser sleeps into controlled-clock module owners.
- [ ] #2 Changed browser owners retain rendered and user-visible behavior through observable conditions.
- [ ] #3 The real serial browser lane passes for every changed browser owner, with no responsive or human-edit regression.
- [ ] #4 Browser renderer observations are measured after raw sleeps become observable conditions before any waiver is considered.
<!-- AC:END -->
