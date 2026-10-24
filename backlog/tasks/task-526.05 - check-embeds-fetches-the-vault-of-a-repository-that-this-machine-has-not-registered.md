---
id: TASK-526.05
title: >-
  check embeds fetches the vault of a repository that this machine has not
  registered
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - cli
  - code-check
dependencies:
  - TASK-526.03
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documentation repositories often embed boards from a vault in another repository, and CI or a contributor has no checkout of it. The owner wants the check to fetch the source instead of skipping it. ADR 0057 decides why the whole vault directory is fetched, the cache, and the offline rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For an unregistered repository, the check fetches the .archboard/vault directory of the default branch shallow and sparse with the person git credentials
- [ ] #2 A fetched vault is cached in the state directory by commit and read again from the cache
- [ ] #3 Offline with a cached copy, the check uses it and reports that as information
- [ ] #4 Offline with no cached copy, the check reports a warning that names the repository
<!-- AC:END -->
