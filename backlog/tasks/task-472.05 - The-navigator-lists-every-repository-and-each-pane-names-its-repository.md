---
id: TASK-472.05
title: 'The navigator lists every repository, and each pane names its repository'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 00:36'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server (done in 4307a826c): GET /api/repositories lists every identity with a known checkout that has a vault and every untracked vault, each with its chosen checkout's canonical vault, state (ready, no-vault, gone, unchosen) and checkouts, plus the served vault until TASK-472.06. PUT /api/repositories/chosen {repository, root}, guarded as the opener settings are, chooses a known checkout, moves every pane of the old chosen vault to the new one with its board, and broadcasts repositories_changed to every tab. A show that names a pane moves it into the board's vault; pane_board carries vault and repository. A report naming a vault the pane left is answered registered:false.
2. Browser, pane-session: each pane holds its vault and repository as a mirror of the server, set only from pane_board. Every pane-scoped call (report, reading, take-back, code open, show) and the socket URL name that vault. The global namedVault and the implicit withVault go.
3. Browser, canvas: a pane vault context that ApplicationPane provides. Every board read, query key and picture cache key includes the vault; board_note invalidates that vault's keys only.
4. Browser, catalog and navigator: the catalog reads the repositories and one board list per ready repository. The navigator shows one repository row per repository with its boards under it and a dot menu of its checkouts that chooses one through the PUT route. A row whose chosen checkout is gone, has no vault or none is chosen says so. Keyboard: the row expands and collapses like a board row, and the menu opens from the keyboard; every mark has an accessible name.
5. Browser, routing: the address gains repoA and repoB beside paneA and paneB, naming the identity or the untracked vault's registry name, never a path. Restore waits for the repositories. A page without repoX opens the served vault's repository.
6. Tests: the server system test (done), module tests of routing, catalog and navigator rows, and the browser tests whose exact addresses gain repoX. One browser owner for two panes on two repositories and the chosen-checkout move.
7. Docs: PRODUCT.md Operating Context and Capabilities, the archboard skill, .archboard/README.md, docs/agents/frontend.md (repoA/repoB contract).
8. Boards: proposals named TASK-472.05 on Browser application, Board viewer, Archboard server routes and Live panes, drawn after the code lands and checked with check --code --variant.
<!-- SECTION:PLAN:END -->
