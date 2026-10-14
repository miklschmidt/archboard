---
id: TASK-472.16
title: A person moves a board to another repository in the browser
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels:
  - frontend
dependencies:
  - TASK-472.15
  - TASK-472.05
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 836000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants a person to move a board without an agent. ADR 0051 makes this the second exception to agents author, users read, beside taking back a claim. Like a take-back, the move is the person's own act and writes no doing line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can choose a target repository or untracked vault for a board and move it through a guarded loopback route
- [ ] #2 Before the move, the browser lists the drill-downs that it will rewrite
- [ ] #3 After the move, the pane that showed the board shows it in its new repository
- [ ] #4 A refused move says why, in the terms of the refusals of `semantic move`
- [ ] #5 The control is operable from the keyboard and has an accessible name
- [ ] #6 PRODUCT.md's constraints and AGENTS.md's invariants name the move as the second browser write beside a take-back, and the archboard skill mentions it
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
