---
id: TASK-436.16
title: Remove registration by observation
status: To Do
assignee: []
created_date: '2026-10-07 00:37'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 710000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`rememberRepo` in `src/runtime/engine/repo-registry.ts` has no caller, so nothing registers a checkout by observation. But `repo list` says that archboard learns checkouts as it goes, and the schema of `repo list` still has the source `observed`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nothing in the code, the help or the documents says that archboard registers a checkout by itself, and `rememberRepo` is gone
- [ ] #2 A `repos.json` that holds an observed registration still reads
<!-- AC:END -->
