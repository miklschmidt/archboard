---
id: TASK-472.12
title: A drill-down can name the repository of the board it opens
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies:
  - TASK-472.02
  - TASK-472.04
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 832000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A drill-down names only a board and variant in its own vault, so a meta project's board cannot open a product repository's board. ADR 0049 lets a drill-down name a repository identity, never a path: without one it stays in its own vault, and with one it opens the vault of that identity's chosen checkout. This task covers the board model, the server and the CLI; the browser task after it makes the pane dive across repositories.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A drill-down accepts an optional repository identity, and a drill-down without one keeps its meaning
- [ ] #2 Reading or rendering a board resolves a drill-down with an identity in the vault of that identity's chosen checkout, with former names and case-insensitive names as in its own vault
- [ ] #3 `archboard check` reports a drill-down whose identity has no known checkout, and one whose target board is not in the chosen checkout's vault
- [ ] #4 The generated board schema carries the field, and the evaluation inputs cover it as the archboard-dev skill requires
- [ ] #5 The archboard skill's recipes and references teach a drill-down into another repository, and CONTEXT.md's Drill-down matches
- [ ] #6 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
