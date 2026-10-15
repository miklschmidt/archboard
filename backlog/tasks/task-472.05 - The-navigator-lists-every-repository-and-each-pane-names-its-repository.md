---
id: TASK-472.05
title: 'The navigator lists every repository, and each pane names its repository'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 02:28'
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
- [x] #1 The navigator lists every identity with a known checkout that has a vault and every untracked vault, each with the boards of its chosen checkout's vault
- [x] #2 Each repository row has a menu of its known checkouts, and choosing one changes the chosen checkout for the whole machine through a guarded loopback route, as the opener setting does
- [x] #3 A repository whose chosen checkout has no vault or is gone says so in its row
- [x] #4 The URL gives each pane its own repository parameter beside its board, holds no path, and names an untracked vault by its registry name
- [x] #5 The two panes of one tab show boards of two repositories
- [x] #6 When the chosen checkout of an identity changes, every pane in every tab that shows a board of that identity reads it again from the new vault, and a pane whose board is not there says so
- [x] #7 The picture cache keys each picture by vault as well as board
- [x] #8 The navigator and its menus are operable from the keyboard and give each mark an accessible name
- [x] #9 PRODUCT.md's Operating Context and Capabilities, the archboard skill, .archboard/README.md and docs/agents/frontend.md describe the navigator and pane addresses as built
- [x] #10 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in 4307a826c (server), a5e0ec308 (browser) and 8a3669814 (AGENTS.md), followed by review fixes, all with `Refs: TASK-472.05`.

Decisions:
- A pane holds the vault and repository that the server put it in, set only from `pane_board` (ADR 0050). A report from a vault the pane left is answered `registered:false` with `PANE_MOVED`, and a reconnecting pane goes back to the vault the server recorded for it.
- Agent activity names its vault and goes to every pane (b3e303193), because the navigator marks the boards of every repository (ADR 0022). A socket that comes back forgets what the tab heard before (83cd04815), because the server tells a new socket only the vaults where an agent is at work.
- The checkout menu is a Base UI DropdownMenu on the repository row. Shift+F10 or the context-menu key opens it, and focus goes back to the row.
- Query keys and picture cache keys carry the vault first. Draw-ahead sweeps run one vault at a time.
- A restored repoA or repoB with no readable vault raises one notice per repository, with the next step (c925e6c61).
- Fix with Codex names the diagnosed vault as ARCHBOARD_VAULT (72dc8511c). The workhorse still runs in the served checkout until TASK-472.10, which has a comment about it.

Deferred, recorded on later tasks: `repo use` and `repo forget` do not tell a running server, a pane in an unchosen checkout reports no repository, and a pane's repository name can go stale (TASK-472.14). Low priority and not recorded elsewhere: a per-pane policy refresh that repeats, a shell-actions memo that depends on the whole catalog, and IndexedDB pictures of vaults that are no longer listed, which stay until the cache evicts them.

Boards: proposals `Archboard server routes@TASK-472.05`, `Board viewer@TASK-472.05`, `Live panes@TASK-472.05` and `Browser application@TASK-472.05`. `check --code --variant TASK-472.05` against the run without `--variant` shows no finding that the proposals introduce, after 3f50f5c03 dropped the edge anchored on the removed `tellPaneAboutVault` and drew the replay's pane vault.

Footprint, read against base 778f1796d (`4307a826c^`). Each proposal's parent is the current variant.
- Archboard server routes: Board routes changed only in 47388b8d6 (TASK-472.12), which is left out. Checkout registry is a part that the proposal adds to this board, because Repository routes call it. Its code is from TASK-472.02, so no commit of this task changed it.
- Board viewer: Semantic viewer, Picture source, Fly into a card and Catalogue queries changed inside: reads and cache keys take the vault of the pane, and the catalog reads one listing for each repository with a vault (a5e0ec308, 931517372, aaf64222d, 5c40c041a, 0f5ba3e84, 04282a8a5, 090667462). What the board draws stays true. Walkthrough replay changed inside in d12fb1373 and 2163ed500: a recorded talk reads in a vault of its own. Browser application draws that. Follow drill-downs is named only by a relationship.
- Live panes: Browser origin guard is named only by a relationship.
- Browser application: nothing to explain.

Validation: `bun run check` passed at 8a5e22ca7 in a clean worktree (4600 module tests, the system and repository lanes, and all 19 serial browser files, exit 0). Owners: navigator-repositories and navigator-tree (rows, checkout menu from the keyboard, states, Working now), workspace-address browser test (two panes on two repositories, a checkout choice moves the pane), the repositories, vault-naming and doing-activity system tests (routes, moves, activity by vault), browser-drawn-pictures (picture keys carry the vault). After adoption `./bin/dogfood check` reports no diagnostics. `check --code` behind: only Archboard server was put behind by this task, and its Route handlers now name the repository routes (version 249).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser is one app over every vault. The navigator lists every repository with a vault, each with the boards of its chosen checkout and a keyboard-operable checkout menu that chooses the checkout for the whole machine. Each pane holds the vault and repository that the server put it in, the address carries repoA and repoB, query and picture keys carry the vault, and agent activity names its vault and reaches every pane. Verified with the complete gate (bun run check, exit 0) and a clean dogfood check after adopting the four TASK-472.05 proposals.
<!-- SECTION:FINAL_SUMMARY:END -->
