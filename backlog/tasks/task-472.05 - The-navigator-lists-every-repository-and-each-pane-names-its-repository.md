---
id: TASK-472.05
title: 'The navigator lists every repository, and each pane names its repository'
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels:
  - frontend
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
ordinal: 825000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser shows one vault. ADR 0050 makes it one app: the navigator lists every registered repository identity that has a vault and every untracked vault, each with the boards of its chosen checkout, and a menu on each repository chooses its checkout for the whole machine. The two panes of a tab can show two repositories.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The navigator lists every identity with a known checkout that has a vault and every untracked vault, each with the boards of its chosen checkout's vault
- [ ] #2 Each repository row has a menu of its known checkouts, and choosing one changes the chosen checkout for the whole machine through a guarded loopback route, as the opener setting does
- [ ] #3 A repository whose chosen checkout has no vault or is gone says so in its row
- [ ] #4 The URL gives each pane its own repository parameter beside its board, holds no path, and names an untracked vault by its registry name
- [ ] #5 The two panes of one tab show boards of two repositories
- [ ] #6 When the chosen checkout of an identity changes, every pane in every tab that shows a board of that identity reads it again from the new vault, and a pane whose board is not there says so
- [ ] #7 The picture cache keys each picture by vault as well as board
- [ ] #8 The navigator and its menus are operable from the keyboard and give each mark an accessible name
- [ ] #9 PRODUCT.md's Operating Context and Capabilities, the archboard skill, .archboard/README.md and docs/agents/frontend.md describe the navigator and pane addresses as built
- [ ] #10 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
