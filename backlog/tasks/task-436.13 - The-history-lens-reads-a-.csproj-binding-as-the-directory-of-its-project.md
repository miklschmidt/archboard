---
id: TASK-436.13
title: The history lens reads a .csproj binding as the directory of its project
status: To Do
assignee: []
created_date: '2026-10-07 00:37'
labels:
  - history
dependencies: []
parent_task_id: TASK-436
ordinal: 707000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads a part bound to a `.csproj` file as the whole directory of the project. The history lens matches only the `.csproj` file itself, so Behind, hotspots, change coupling and footprints miss commits that change only the `.cs` files of the project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a part bound to a `.csproj` file, the history lens counts commits to every file in the directory of the project
- [ ] #2 The code check and the history lens get the files of a binding from one function
<!-- AC:END -->
