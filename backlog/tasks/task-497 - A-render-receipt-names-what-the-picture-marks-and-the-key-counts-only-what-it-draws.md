---
id: TASK-497
title: >-
  A render receipt names what the picture marks, and the key counts only what it
  draws
status: To Do
assignee: []
created_date: '2026-10-18 13:15'
labels:
  - renderer
  - cli
dependencies: []
priority: medium
type: bug
ordinal: 862000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent rendering a design view on the device trust stack saw "Changed 1" in the key and no changed mark in the picture, and could not tell what had changed. The render receipt reports only the board, variants, view, file and size, so the only way to learn what a picture marks is to read its pixels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The render receipt lists the subjects that the picture marks as added, changed or removed, with the counts that the key shows
- [ ] #2 Every count in the key matches a mark that the picture draws, or the cause of a difference is found and fixed
<!-- AC:END -->
