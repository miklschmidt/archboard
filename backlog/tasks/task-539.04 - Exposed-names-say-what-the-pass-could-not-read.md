---
id: TASK-539.04
title: Exposed names say what the pass could not read
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - code-check
  - ui
dependencies:
  - TASK-539.02
parent_task_id: TASK-539
type: feature
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A count of users is only as good as the files the pass read. An incomplete reading must never look complete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The region lists the outside files in the language that no grammar read, and the files that name an exposed name only in code that did not parse
- [ ] #2 The region lists the skips of the container and of its repository
- [ ] #3 A reading of a pinned ref names the ref
<!-- AC:END -->
