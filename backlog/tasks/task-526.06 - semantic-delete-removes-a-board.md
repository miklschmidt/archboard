---
id: TASK-526.06
title: semantic delete removes a board
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - cli
dependencies:
  - TASK-526.04
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard has no command that deletes a board, so a deletion happens by hand in Git and nobody learns which embeds showed it. The owner asked for the command. ADR 0057 decides its refusals and what its answer lists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard semantic delete <board> removes the whole note, with the lease, --doing from an agent and --expect-version
- [ ] #2 The delete is refused while a node on another board opens the board, and the refusal names those boards
- [ ] #3 The answer lists the tracked embeds of the deleted board
- [ ] #4 After a delete, a new board can take the name and the former names
- [ ] #5 The browser offers no delete
<!-- AC:END -->
