---
id: TASK-472.14
title: >-
  browser show chooses the agent's checkout, and browser panes reports each
  pane's repository
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 03:46'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 02:09
---
Found in the TASK-472.05 review: `archboard repo use` and `repo forget` change the registry without telling a running server, so no tab hears `repositories_changed` and no pane moves. Also, `pane_board.repository` is null for a pane in the vault of a checkout that is not the chosen one. Make the CLI commands go through the server (or announce the change), and decide what a pane in an unchosen checkout reports.
---

created: 2026-10-15 02:12
---
Also found in the TASK-472.05 review: a pane's repository name comes from `pane_board` and is not sent again when the repository list changes (a forgotten repository, or a second checkout that makes a name unique with -2). Make sure that the name a pane reports stays current.
---

created: 2026-10-15 03:46
---
From the TASK-472.06 boundary review: the registry makes an untracked vault's name unique (-2, -3) only against identities known when it registers. A repository with no remote registered later under the same directory name gives two navigator entries with one name, and the page resolves repoA and pane names by the first match, so it can open the wrong vault. Decide whether the untracked vault is renamed (and the user told) when a colliding identity arrives, or whether names are made unique when the list is built.
---
<!-- COMMENTS:END -->
