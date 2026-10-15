---
id: TASK-480
title: A checkout with no vault is told which known vaults hold boards of its code
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 18:19'
updated_date: '2026-10-15 18:29'
labels: []
dependencies: []
priority: medium
ordinal: 845000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Some teams keep the architecture of a code repository in another repository. Admin-By-Request keeps the boards of Platform in Docs-Architecture-Design, and their nodes bind Platform code with `binding.repo` github.com/Admin-By-Request/Platform. An agent that works in a Platform checkout, such as ~/Work/Platform, runs a board command and gets `VAULT_NOT_FOUND` (exit 2). The message suggests `archboard install-skill`, which would create an empty vault in Platform, or `-C <dir>` without naming a directory. No command searches the known vaults for a board by name or by the code it binds, so the agent finds the boards only when the user gives it the path. Found during the archboard-pr audit of Platform #599 to #615 (TASK-478). The checkout registry (`archboard repo list`) already knows every checkout, its repository identity and every untracked vault. Local paths in the message are for the agent only: archboard-pr already keeps local paths out of a pull request body. Docs-Architecture-Design still uses the old `architecture-design/` layout with `ARCHBOARD_VAULT` and is not in the registry, so this hint finds it only after that repository moves to `.archboard/vault`. That move is work in that repository, not here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inside a git checkout with no vault, when a vault that the registry knows (the vault of a chosen checkout, or an untracked vault) holds boards with a node bound to the checkout's repository identity, the `VAULT_NOT_FOUND` refusal names the directory of each such vault as the `-C` to give, and the names of those boards
- [ ] #2 When such a vault exists, the refusal leads with `-C` and not with `archboard install-skill`; when none exists, the refusal says what it says today
- [ ] #3 The refusal still exits 2, and nothing is registered, created or written
- [ ] #4 The archboard skill tells an agent in a checkout with no vault to follow that hint, and the archboard-pr skill's rule for architecture kept in another repository points to it
- [ ] #5 A test owner proves the named vault directory, the board names and the exit status for a checkout that a known vault binds, and the unchanged refusal for one that none binds, without matching the wording of the message
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: Command dispatch@TASK-480. Command dispatch draws Addressed vault, Vault finder and Checkout registry. The task adds the lookup that reads the boards of the known vaults, and the calls that reach it. No other board draws vault finding.

1. Vault finder (src/runtime/engine/vault-finder.ts). The search takes an optional lookup, `vaultsBoundTo(repo)`, that answers the known vaults whose boards bind a repository. The finder cannot import the board store, because the registry imports the finder and the store imports the registry. On `checkout-without-vault`, when the lookup is given, the finder reads the checkout's identity (`repoIdentityAt`) and asks the lookup. A lookup that throws counts as none. The refusal carries `repository` and `bound` (holder and board names), and its message leads with `-C <holder>` and the board names, at most a few names for each vault, in place of `install-skill`. With no bound vault, the message is the same as today.
2. Bound vaults (src/runtime/semantic-board-store/lib/bound-vaults.ts, exported from the store index). The known vaults are the ones the navigator lists: the vault of each chosen checkout that exists, and each untracked vault that exists, in the `.archboard/vault` layout. For each, list the boards and decode each file in memory (`decodeSemanticBoardDocument`). That reads no lease and writes no migration. A board counts when a node of any variant has `binding.repo` equal to the repository.
3. Addressed vault (src/cli/command-routing/lib/addressed-vault.ts). `addressVault` gives the finder the lookup. `findVaultOf` (`--to` of a move) does not, because a move target must hold its own vault.
4. Contract: the VAULT_NOT_FOUND description in src/cli/command-contract/lib/common.ts says that the refusal names such vaults. Regenerate the skill artifacts if they carry it.
5. Skills: the archboard skill's Essentials tell an agent in a checkout with no vault to follow the named `-C`. The archboard-pr rule for architecture kept in another repository points to it.
6. Test owner: tests/system/cli/vault-finding.test.ts. A checkout that an untracked vault's board binds is refused with exit 2, the holder's path and the board's name on stderr, and nothing created or registered. A checkout that no known vault binds does not get the holder named. No wording matched.
7. Close with the archboard-dev steps: code check, footprint, adoption, `archboard check`, and `bun run check`.
<!-- SECTION:PLAN:END -->
