---
id: TASK-472.06
title: The CLI finds its vault from the directory it runs in
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 04:09'
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
- [x] #1 With `ARCHBOARD_VAULT` unset, every command run anywhere inside a git checkout uses `.archboard/vault` at the checkout root
- [x] #2 Inside a checkout with no vault at its root, a command refuses and says how to set the repository up, and never uses a vault of a directory above the checkout
- [x] #3 Outside any git checkout, a command uses the `.archboard/vault` of the nearest enclosing directory, and refuses when there is none
- [x] #4 `-C <dir>` makes a command find its vault from that directory by the same rule
- [x] #5 Every answer names the vault it used and its origin, `-C`, the environment or the working directory, in its machine-readable output
- [x] #6 The first command in an unregistered checkout or untracked vault registers it, and that answer says so
- [x] #7 Autostart and `archboard start` start a server without a vault, and that server serves the vault that each call names
- [x] #8 The Codex child environment holds no `ARCHBOARD_VAULT`; until the workhorse task lands, the board context that a thread receives names each board's vault directory so that the thread can pass `-C`
- [x] #9 INSTALL.md, AGENTS.md, PRODUCT.md, .archboard/README.md, the archboard skill and the archboard-pr skill describe how a command finds its vault and what `-C` does
- [x] #10 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vault finder (src/runtime/engine/vault-finder.ts): `findVault({directory, environment, cwd})`. Order: `-C <dir>`, then a set ARCHBOARD_VAULT (expand step), then the working directory. In a git checkout only `<root>/.archboard/vault` counts, and a missing one is refused without walking above the root. Outside a checkout the nearest enclosing `<dir>/.archboard/vault` counts. Refusal `VAULT_NOT_FOUND` (exit 2) names the directory, the origin and the way out. Module owner with real temporary git repositories.
2. Codex workbench reads no served vault: the child environment loses ARCHBOARD_VAULT, a change's context uses the change's own vault, each tab session hears only the vaults its panes are in, the voice catalogue reads the presenting pane's vault, and the board brief names the board's vault so a thread can pass `-C`. Instruction files say so.
3. Server needs no vault: no start refusal. `/api/served-vault` answers the opening vault or null: a set ARCHBOARD_VAULT, else the first ready repository by name, else null. `served` becomes nullable, `/health` and sync status drop the board count. The page opens in the opening vault, or says that no repository with a vault is known and how to get one.
4. CLI finds its vault: a shared option `-C <dir>` (also accepted before the command name) on every command whose calls need a vault. The found vault rides on every call. Every JSON answer of those commands carries `vault: {path, origin}`. The spawn-time vault check and noVaultMessage go. `-C` changes only where the vault is found, not how other relative paths resolve.
5. First use registers: a found checkout or untracked vault that the registry does not know is declared, and the answer carries `vault.registered`, with one stderr line. A vault from the environment never registers. A registry that cannot be written is a warning.
6. `semantic record` names `repoA` for a found vault, and refuses in a checkout that is not the chosen one. Fix with Codex uses `archboard -C <vault>`.
7. Docs and skills: INSTALL.md, AGENTS.md, PRODUCT.md, .archboard/README.md, TESTING.md, README.md, the archboard skill (then generate:skill-artifacts) and the archboard-pr skill.
8. Boards: proposals named TASK-472.06, drawn after the code lands and checked with check --code --variant: Archboard, Command interface, Command dispatch, Archboard server routes, Live panes, Browser application, Archboard server, Agent workbench, Voice coordinator and Board rasterizer, as the code check and footprint show.

Decisions taken where the ADRs are silent: -C wins over ARCHBOARD_VAULT. Only commands that call vault routes find a vault (not start, stop, status, browser panes, browser close, replay, repo, install-skill). Text and raw outputs carry no vault field. Until TASK-472.10 a thread that omits -C reaches the archboard checkout's own vault.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built by two implementers in parallel (CLI half in a worktree, merged in 684fb771b; server and Codex half on main), then four reviewers (CLI, server and Codex, the CLI–server boundary, and the brief–`-C` boundary) and a docs writer. All commits carry `Refs: TASK-472.06`.

Decisions:
- `findVault` (src/runtime/engine/vault-finder.ts): `-C`, then a set ARCHBOARD_VAULT (refused up front when it names no directory), then the working directory. In a checkout only `<root>/.archboard/vault` counts. Outside one, the nearest enclosing `<dir>/.archboard/vault` counts. A refusal is VAULT_NOT_FOUND, exit 2, before anything starts.
- `-C` is a shared option on the commands that call vault routes: semantic (not replay), check, claim, release and browser show. browser open, panes and close, start, stop, status, repo and install-skill take none. A leading `-C` works before the command name and beside `--url` (a10d8cc1c).
- Every JSON object answer of those commands carries `vault: {path, origin, registered?}`. The first command in an unknown checkout or untracked vault registers it. A vault from the environment never registers. The registry compares and stores real paths (f26a0b12a, 5236d4b39).
- The server needs no vault. The page opens in a set ARCHBOARD_VAULT that names a directory, else the first ready repository by name, else it says no vault is known. /health and sync status no longer count boards.
- The Codex child has no ARCHBOARD_VAULT. A brief names its board's vault, the instructions list the commands that take `-C`, a tab session hears the vaults of its panes (and, through a reload, the vault it last presented through), and the voice catalogue follows the presenting pane (e475456d8).
- The heavy Blocks cases of wide-boards.test.ts keep their declared 120 s budget locally too (9af787d0f, Refs TASK-377). TASK-472.05's adoption made Browser application's Blocks layout 52.9 s against 18.5 s.

Recorded on other tasks: a thread that omits `-C` reaches archboard's own vault until TASK-472.10. TASK-447 still asks for ARCHBOARD_VAULT. Navigator name collisions between an untracked vault and a later repository are on TASK-472.14. The README quick start and the archboard-pr trigger are on TASK-472.09 and TASK-471.03.

Boards: ten proposals named TASK-472.06 (Archboard, Command interface, Command dispatch, Archboard server routes, Live panes, Browser application, Archboard server, Agent workbench, Voice coordinator, Board rasterizer). `check --code --variant TASK-472.06` against the run without `--variant`: no finding introduced, and six cleared (the board-count anchors, the moved workbench pane lookup, the opening vault edges).

Footprint, read against base b032fd31b. Each proposal's parent is the current variant.
- Command interface: every command contract that declares `-C` (Semantic authoring, Semantic lifecycle, Comparison, Rasterize, Vault check, Claims, Panes, Render, Inspect, Rename, Locality, Footprint) changed only by that declaration. Status dropped the board count. runCommand passes the found vault. Command contract and Commands are containers.
- Command dispatch: Interruptible run and runCommand pass the found vault; Failure reporting maps VAULT_NOT_FOUND to exit 2; Command routing is a container.
- Archboard server routes: Repository routes take the shared choice schema and a nullable served vault; Checkout registry compares real paths. Both draw the same.
- Live panes: Application lifetime, Vault requirement, Repository routes and Repository list are drawn at this board's level, and Archboard server routes draws what changed in them. Board announcements is named as a part with no commit of this task: its text corrects what TASK-472.05 built (activity reaches every pane). Pane registry and Pane session are named only by a relationship or a step.
- Agent workbench: Codex process (the child env), Board-change delivery (a change carries its vault) and Tab sessions (the presenting vault, the per-tab feed). Semantic context now says so.
- Voice coordinator: Coordinator callbacks, Semantic context, Authored instructions and Tab sessions changed inside. Realtime voice is named as a part with no commit: its description now says where the catalogue comes from, which Tab sessions code decides.
- Board rasterizer: Recording entry carries the repository into the request.

Validation: `bun run check` at 4c1523d46 in a clean worktree with an isolated ARCHBOARD_REPOS: lint, format, type-check, 4614 module tests, 221 system tests and 27 repository tests passed. One serial browser case raced the address against each pane's repository report; cf252a004 waits for the settled address, and the browser lane then passed all 19 files. No test wrote the isolated registry. By hand: `archboard start` with no ARCHBOARD_VAULT in an isolated home started a server that answered /api/served-vault with a null vault. After adoption `./bin/dogfood check` reports no diagnostics. `check --code` behind: only Codex workhorse was put behind (Thread tools, Authored instructions, Coordinator callbacks), by instruction text, digests and test fixtures, and what it draws is still true.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A command finds its vault the way git finds its repository: from -C, a set ARCHBOARD_VAULT, or the working directory, at the checkout root, or outside a checkout at the nearest enclosing .archboard/vault. Every JSON answer names the vault and its origin, the first command registers an unknown checkout or untracked vault, and the server starts without a vault and opens a page in its opening vault. The Codex child names no vault, and each brief gives a thread its board's vault for -C. Docs and skills describe the rule. Verified with the complete gate, the new vault-finder and vault-finding owners, a by-hand start without a vault, and a clean dogfood check after adopting ten proposals.
<!-- SECTION:FINAL_SUMMARY:END -->
