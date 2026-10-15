---
id: TASK-472.06
title: The CLI finds its vault from the directory it runs in
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 02:12'
labels: []
dependencies:
  - TASK-472.02
  - TASK-472.04
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
ordinal: 826000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plain `archboard` needs `ARCHBOARD_VAULT` exported. ADR 0049 makes the CLI find its vault as git finds its repository: from the working directory or `-C <dir>`, at the checkout root's `.archboard/vault`, or outside any checkout at the nearest enclosing `<dir>/.archboard/vault`. The server needs no vault to start. Expand step: a set `ARCHBOARD_VAULT` still decides here; the test migration task moves the tests, and the refusal task refuses the variable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With `ARCHBOARD_VAULT` unset, every command run anywhere inside a git checkout uses `.archboard/vault` at the checkout root
- [ ] #2 Inside a checkout with no vault at its root, a command refuses and says how to set the repository up, and never uses a vault of a directory above the checkout
- [ ] #3 Outside any git checkout, a command uses the `.archboard/vault` of the nearest enclosing directory, and refuses when there is none
- [ ] #4 `-C <dir>` makes a command find its vault from that directory by the same rule
- [ ] #5 Every answer names the vault it used and its origin, `-C`, the environment or the working directory, in its machine-readable output
- [ ] #6 The first command in an unregistered checkout or untracked vault registers it, and that answer says so
- [ ] #7 Autostart and `archboard start` start a server without a vault, and that server serves the vault that each call names
- [ ] #8 The Codex child environment holds no `ARCHBOARD_VAULT`; until the workhorse task lands, the board context that a thread receives names each board's vault directory so that the thread can pass `-C`
- [ ] #9 INSTALL.md, AGENTS.md, PRODUCT.md, .archboard/README.md, the archboard skill and the archboard-pr skill describe how a command finds its vault and what `-C` does
- [ ] #10 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 02:09
---
Found in the TASK-472.05 review: a pane's repository name comes from `pane_board` and is not sent again when the repository list changes (a rename, a forgotten repository, or a second checkout that makes a name unique with -2). Make sure that the name a pane shows stays current.
---

created: 2026-10-15 02:12
---
The comment above about a stale repository name belongs to TASK-472.14, and is recorded there.
---
<!-- COMMENTS:END -->
