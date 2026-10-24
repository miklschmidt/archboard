---
id: TASK-526.04
title: render --track makes a tracked embed that its board lists
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - cli
  - schema
  - code-check
dependencies:
  - TASK-526.03
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 924000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A change in the vault repository can make an embed in another repository outdated, and that repository is often not checked out on the machine that made the change. The owner wants the board side to know where its pictures are shown, by explicit opt-in. ADR 0057 decides a board-level list of { repo, path }, why the vault side reports information and not a warning, and how a move carries the list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic render --out <file> --track adds { repo, path } to a board-level list, and semantic show returns the list
- [ ] #2 --track takes the lease, needs --doing from an agent and raises the version, and does not move the last change that behind reads
- [ ] #3 --track is refused when no registered checkout of the vault repository exists or the file is in no Git checkout
- [ ] #4 In the vault repository, check embeds reports an outdated tracked embed of another repository as information
- [ ] #5 --fix in the vault repository draws a tracked embed again only in a registered checkout, and names the others
- [ ] #6 After a move, the target vault check names each tracked embed whose recipe names the old repository, and --fix rewrites the recipe
<!-- AC:END -->
