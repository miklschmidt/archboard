---
id: TASK-632.03
title: >-
  The reader records reading sessions and the actions of each job, and its
  errors
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-12T23:15:00Z'
labels: []
dependencies:
  - TASK-632.01
parent_task_id: TASK-632
priority: medium
type: feature
ordinal: 1077000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader serves two jobs: understanding a system and planning a change. The owner wants to know which actions people use in each job and how long a reading session lasts. The reader shows the user's architecture, so it must not use autocapture or session replay, and it sends its records to the local server, not to PostHog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The daily event counts reader sessions and their total minutes
- [ ] #2 The daily event counts the actions of each job: opening a module, opening code, viewing diagnostics, comparing proposals, and playing or recording a walkthrough
- [ ] #3 An unexpected reader error sends one error event with the reader's own stack frames and no model content
<!-- AC:END -->
