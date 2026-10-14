---
id: TASK-472.14
title: >-
  browser show chooses the agent's checkout, and browser panes reports each
  pane's repository
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies:
  - TASK-472.05
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 834000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent in a worktree that runs `browser show` would show a board that the app does not read, because the app reads the chosen checkout of each identity. ADR 0050 decides that `browser show` makes the caller's checkout the chosen one when it is not, and says so. `browser panes` reports the whole screen, with each pane's repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `browser show` from a checkout that is not chosen makes it the chosen checkout of its identity before it shows the board, and the answer names the checkout it replaced
- [ ] #2 `browser show` from the chosen checkout changes no choice
- [ ] #3 Only `browser show`, `repo use` and the navigator's menu change a chosen checkout, and no board command does
- [ ] #4 `browser panes` reports every pane with its repository identity, its checkout and whether it shows the caller's own checkout
- [ ] #5 The archboard and archboard-pr skills and the help of the `browser` commands describe the new answers as built
- [ ] #6 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
