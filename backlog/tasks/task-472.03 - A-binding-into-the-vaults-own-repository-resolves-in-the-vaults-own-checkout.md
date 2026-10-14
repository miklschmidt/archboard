---
id: TASK-472.03
title: A binding into the vault's own repository resolves in the vault's own checkout
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies:
  - TASK-472.01
  - TASK-472.02
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 823000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check resolves every binding through the registry, so a proposal in a worktree is checked against the code of the main checkout, while `behind` already uses the git root of the vault. ADR 0049 sets one rule for every reader: a binding or anchor that names the identity of the vault's own checkout resolves in that checkout, and any other identity resolves in its chosen checkout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a worktree whose vault binds to its own repository identity, `check --code` reads the worktree's files while another checkout of that identity is chosen
- [ ] #2 A binding or anchor that names another identity resolves in that identity's chosen checkout
- [ ] #3 Opening the code of a part on a board of a worktree's vault opens the worktree's file
- [ ] #4 `behind`, footprint and locality follow the same rule
- [ ] #5 One function owns the rule, and every reader calls it
- [ ] #6 The archboard skill and the archboard-dev skill describe where a binding resolves as built
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
