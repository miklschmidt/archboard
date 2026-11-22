---
id: TASK-663.07
title: This repository's relationships state their kind and effect
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
labels: []
dependencies:
  - TASK-663.04
  - TASK-663.02
  - TASK-663.03
parent_task_id: TASK-663
ordinal: 1151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upgrade this vault through the inventory of TASK-663.04: every one of its 1328 relationships gets a kind and an effect read from the code (1032 calls, 160 dependencies, 34 data reviewed from the code, not relabelled from their labels), split by root module. Then compare wide pictures through main and all, and report the line counts in wide scopes through the settled main and the alternative that keeps in-process queries, so the owner can choose the default with evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every relationship of this vault states its kind, and every one but an effectless dependency its effect
- [ ] #2 The kind histogram before and after, and the count of mutations whose side effect could not be ruled out, are in the pull request
- [ ] #3 Wide pictures before and after, through main and all, in both themes, are in the pull request, with line counts for both candidate defaults
- [ ] #4 archboard check passes on the upgraded vault
<!-- AC:END -->
