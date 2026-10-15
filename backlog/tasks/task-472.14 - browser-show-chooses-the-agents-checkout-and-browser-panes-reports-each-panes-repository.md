---
id: TASK-472.14
title: >-
  browser show chooses the agent's checkout, and browser panes reports each
  pane's repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 05:41'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Registry (src/runtime/engine/repo-registry.ts). Add `chooseKnownCheckout(root)`. It chooses a known checkout in the registry only, and returns the checkout and the one it replaced. The page's menu route and `browser show` both use it. Comment 3: a checkout can arrive whose identity is the registry name of an untracked vault. Then the same registry write gives the vault a new unique name (`-2`, `-3`). The command that registered the checkout says so: `renamed` in its answer, and one line. Decision: the registry keeps every name unique, and the browser list is built from the registry. So the CLI and the browser use one name. An identity is never renamed, because drill-downs and bindings name it.
2. The server follows the registry (src/server/archboard/lib/repository-routes.ts and repositories.ts). Add one `followRegistry()`. A pane can be in the vault of a known checkout that is not chosen. It then moves to the vault of the chosen checkout, with its board. Every other pane gets a boardless `pane_board` with its vault and its current repository name (comment 2). Then every tab hears `repositories_changed`. Three callers use it: the menu choice, a `browser show` that chose, and a new route `POST /api/repositories/changed`. The CLI calls that route after it changes the registry. The body names the registry file. The server follows only its own registry, so a command with another registry (a test) changes nothing on another server.
3. `pane_board.repository` (decision for comment 1). It is the name of the registered directory that holds the pane's vault, chosen or not: the identity of a checkout, or the registry name of an untracked vault. It is null only for a vault that no registered directory holds and that the list does not show. One function, `placeOfVault`, gives the name and the checkout of a vault. The show route, the socket start and the panes report use it.
4. The CLI tells the server (comment 1). `announceRegistryChange()` in src/runtime/engine/server-client.ts posts the notice. It never starts a server and never fails the command. If nothing answers, nobody is told. Any other failure gives one warning line. `repo add`, `repo use`, `repo forget` and the first-use registration in addressed-vault.ts call it. The help of the repo commands says so.
5. `browser show` (AC1, AC2). An agent's show (`agent: true`) can come from the vault of a known checkout that is not chosen. Then the server chooses that checkout first, follows the registry and shows the board. The answer adds `checkout`. When the choice changed, it also adds `chose: {repository, checkout, replaced}`, and one line says so. A show from the chosen checkout or from an untracked vault changes no choice and has no `chose`. The page's own shows never choose.
6. `browser panes` (AC4). Each pane of the report gains `vault`, `repository`, `checkout` and `own`. The command finds its vault from its working directory. It does not refuse and does not register, so `browser panes` still needs no vault. `own` is true for a pane in that vault. If the command finds no vault, `own` is false for every pane. The `--text` read-out names the repository of each pane and marks the caller's own checkout.
7. AC3. No board command calls `chooseKnownCheckout`. First-use registration chooses only the first checkout of an identity. A system test runs board commands in a checkout that is not chosen, and then reads `repo list`.
8. Tests. A new system owner, tests/system/server-state/browser-show-checkout.test.ts, uses an owned server, its own registry, a git fixture with a worktree and observed panes. It proves these: a show from a checkout that is not chosen chooses it, names the one it replaced and moves the other panes. A show from the chosen checkout changes nothing. Board commands change no choice. `browser panes` gives the repository, the checkout and `own`. `repo use` and `repo forget` move or rename the panes. A remoteless repository with a colliding name renames the untracked vault, and its pane hears the new name. The case in repositories.test.ts that relied on "`repo use` tells the server nothing" changes to the new behaviour. A UI module test in pane-session proves that a boardless `pane_board` changes the repository name and keeps the board.
9. Docs (AC5). Update the help of `browser show`, `browser panes`, `repo add`, `repo use` and `repo forget`. Update the Essentials of the archboard skill. They say that a show chooses, and that `chose.replaced` names the checkout it replaced. The agent tells the user. They also give the new pane fields. Update the line on `repo use` in authoring.md. Update the archboard-pr walkthrough reference: in a checkout that is not chosen, `semantic record` refuses with CHECKOUT_NOT_CHOSEN, and `browser show` makes the checkout chosen. Update INSTALL.md (the checkouts section) and CONTEXT.md (Chosen checkout). If a generator covers the skill references, run it.
10. Boards (AC6). The parent draws them, and I do not edit .archboard/vault. `Archboard server routes`: the new registry route, and the show route that chooses a checkout through the registry. `Live panes`: panes follow the registry (moves and new names), and the panes report gives each pane's repository and checkout. `Command interface`: the repo commands and `browser show` tell the server, and `browser panes` reads the new fields. `Command dispatch`: first-use registration tells the server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (TASK-472.14):
- Comment 1, how the CLI tells the server. The CLI writes the registry itself, as before, so `repo` works with no server. Then it posts `POST /api/repositories/changed` with the registry path. It never starts a server. `repo add`, `repo use`, `repo forget` and the first-use registration do this. If the path is the registry that the server reads, the server follows it. Otherwise it does nothing, so a command with another registry, such as a test's, moves no pane of the user's server. A server that answers and is not told gives one warning line. The command never fails for it.
- Comment 1, what `pane_board.repository` reports. It is the name of the registered directory that holds the pane's vault, chosen or not: the identity of a checkout, or the registry name of an untracked vault. It is null only for a vault that no registered directory holds and that the list does not show. One function, `placeOfVault` in src/server/archboard/lib/repositories.ts, gives it to the show route, the socket start and the panes report.
- Comment 2. Every registry change that the server sees runs `followRegistry()`. A pane in the vault of a checkout that is not chosen, or that is gone, moves to the chosen checkout with its board. Every other pane gets a `pane_board` without a board, with its vault and the name its repository has now. The page takes the name and keeps its board, also a drilled-down one. Then every tab hears `repositories_changed`.
- Comment 3. The registry keeps every name unique. When a checkout is recorded whose identity is an untracked vault's registry name, the same write gives the vault the next free name. The identity keeps its name, because drill-downs and bindings name it. The answer gives `renamed: {root, from, to}`, and the first-use registration line says so. A registry that already holds such a pair, written between TASK-472.06 and now, is not repaired on read. To repair it, run `repo add` in that checkout, because only a recorded checkout renames a vault.
- `browser show` chooses only for an agent's show (`agent: true`, which every CLI show sends). The page's own shows never choose. The show chooses only after nothing can refuse it. The other panes follow after the shown pane arrives. So the shown pane is never sent first to its old board in the new checkout.
- The navigator menu's choice now uses the same registry-only `chooseKnownCheckout` as the show, in place of `declareDirectory` (no git call). If the checkout was chosen already, the menu still follows the registry.
- `browser panes` still needs no vault. It finds the caller's vault from the working directory without refusing and without registering, and names it on `GET /api/panes?vault=`. If the command finds no vault, `own` is false for every pane. `browser panes` takes no `-C`.
- GET /api/panes moved from pane-routes.ts to the new pane-report-route.ts, because pane-routes.ts reached the 600-line limit.

Validation: `ARCHBOARD_REPOS=/tmp/t14-gate-repos.json bun run check` exits 0. Lint and fmt pass. test:modules: 4641 pass, 1 skip, 0 fail. test:system: 226 pass, 0 fail. test:repository: 27 pass, 0 fail. test:serial-browser: 19 of 19 owners finish, and the lane exits 0. After the gate, /tmp/t14-gate-repos.json does not exist, so no test wrote that registry.
Proof owners: tests/system/server-state/browser-show-checkout.test.ts (AC1, AC2, AC3, AC4, comments 1 to 3). src/ui/pane-session/tests/pane-connection.test.ts, "a pane told only where it is takes its repository's new name and keeps its board" (comment 2, page side).
Open for the parent: in an archboard worktree, `browser show` against the worktree's own server chooses the worktree in the registry that every server shares. The main server on port 3000 is not told, so its panes move only at its next registry notice. This follows ADR 0050 ("the last show wins"), but it works against the reason that ADR 0049 gives worktrees their own ports.
<!-- SECTION:NOTES:END -->

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
