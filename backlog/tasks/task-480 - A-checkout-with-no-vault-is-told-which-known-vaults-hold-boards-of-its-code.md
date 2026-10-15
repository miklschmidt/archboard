---
id: TASK-480
title: A checkout with no vault is told which known vaults hold boards of its code
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 18:19'
updated_date: '2026-10-15 18:48'
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
- [x] #1 Inside a git checkout with no vault, when a vault that the registry knows (the vault of a chosen checkout, or an untracked vault) holds boards with a node bound to the checkout's repository identity, the `VAULT_NOT_FOUND` refusal names the directory of each such vault as the `-C` to give, and the names of those boards
- [x] #2 When such a vault exists, the refusal leads with `-C` and not with `archboard install-skill`; when none exists, the refusal says what it says today
- [x] #3 The refusal still exits 2, and nothing is registered, created or written
- [x] #4 The archboard skill tells an agent in a checkout with no vault to follow that hint, and the archboard-pr skill's rule for architecture kept in another repository points to it
- [x] #5 A test owner proves the named vault directory, the board names and the exit status for a checkout that a known vault binds, and the unchanged refusal for one that none binds, without matching the wording of the message
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in bda65700c. Plan and first proposal in 200481447. Boards adopted in 66bf487bc.

What changed. `findVault` takes an optional lookup, `vaultsBoundTo(repo)`. In a checkout with no vault, the finder reads the checkout's identity (`repoIdentityAt`) and asks the lookup. The refusal carries `boundElsewhere`: the repository and its vaults. Its message names each vault's directory as the `-C` to give. It gives up to five board names and counts the rest. A lookup that throws or finds nothing leaves the refusal as it was. The lookup is `vaultsBoundTo` in the board store (lib/bound-vaults.ts). It reads the vault of each chosen checkout and each untracked vault that exist, in the layout. It decodes each board in memory with `decodeSemanticBoardDocument`, so it takes no lease and writes no migration. Only `addressVault` passes it. `findVaultOf` (`--to` of a move) does not, because a board moves into that directory's own vault. The VAULT_NOT_FOUND description in common.ts says so. The archboard skill's Essentials and the archboard-pr rule for architecture in another repository tell the agent to use the named `-C`. Generated skill artifacts and the CLI contract were regenerated, with no tracked change.

The refusal, from a scratch registry with an untracked vault holding two archboard boards and a checkout whose origin is github.com/miklschmidt/archboard:
Error: The working directory, /tmp/pr-audit/demo-2r5t/fake, is inside the git checkout /tmp/pr-audit/demo-2r5t/fake, which has no .archboard/vault at its root. The boards of its repository, github.com/miklschmidt/archboard, are in another vault. Run the command with -C <dir>: /tmp/pr-audit/demo-2r5t/docs holds "Archboard", "Command dispatch". Nothing was done.
(exit 2)

Test owner: tests/system/cli/vault-finding.test.ts, "a checkout without a vault is told which known vault holds boards of its code, and nothing is created". An untracked vault holds a board that binds github.com/acme/billing. In the billing checkout, the command exits 2 and prints nothing on stdout. Its stderr names the vault's directory and the board's name. It creates no .archboard and leaves the registry bytes unchanged. In a checkout of github.com/acme/ledger, which no vault binds, the refusal does not name that directory. No wording is matched. Mutation: with the lookup removed from addressVault, this test fails and the other 8 pass.

Boards. Command dispatch@TASK-480 drew Bound vaults, its calls to Checkout registry and Vault finder, and the call from Addressed vault, and changed the Vault finder description. Board persistence was not named at planning. `check --code` behind showed that Board store changed. Its Archboard server part said that every read of a board comes through the server, and the command line's lookup made that false. Board persistence@TASK-480 drew Bound vaults inside Board store, with its calls to List boards and Decode board bytes. It also drew Command dispatch as a second caller and corrected the server's responsibility. After adoption, `archboard check` reported DRILL_DOWN_LEVEL_MISMATCH on the new Command dispatch part (kind service, board level module). Its kind was corrected to module on the current variant, and `archboard check` then exited 0.

Code check: the findings with and without `--variant TASK-480` are the same 22 lines for both proposals. The run read the TASK-480 variant of each board.

Footprint, read against base 200481447 (the commit before bda65700c). Command dispatch: current is TASK-472.09, the proposal's parent. Named and changed: Addressed vault, Vault finder, Bound vaults. Changed but not named: Command routing, a directory container whose only changed file is addressed-vault.ts, which the proposal names. Named but not changed: Checkout registry, named only by a new relationship. Board persistence: current is TASK-472.16, the parent. Named and changed: Bound vaults. Changed but not named: Board store, a directory container whose changes are bound-vaults.ts (named) and the index export, which compare shows as the new entry point. Named but not changed: List boards and Decode board bytes, named only by new relationships. Skipped: the drill-down parts Archboard server (a wording correction with no code change) and Command dispatch (its board has its own adopted proposal).

Behind after adoption: Command interface is behind by bda65700c through Command contract, because the VAULT_NOT_FOUND description changed. The board draws the contract module and not refusal text, so it stays right. The other boards that are behind come from commits of other tasks.

README: `bun run readme:check` lists 16 stale assets. Each one has source files changed by earlier work on this branch (merge base to ef4f68bbb), so all were stale before this task. Five list sources that bda65700c also touched (src/cli/command-contract/lib/common.ts and src/cli/command-routing/lib/addressed-vault.ts). No asset shows the VAULT_NOT_FOUND refusal, so this task made no asset stale.

Docs-Architecture-Design still uses the old architecture-design/ layout and is not in the registry, so the hint finds it only after it moves to .archboard/vault.

Gate: `bun run check` passed at 66bf487bc (exit 0, no failing test in any lane, serial browser lane included).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A command run in a checkout with no vault now names each known vault whose boards bind that checkout's repository, as the -C to give, with up to five board names. It leads with -C in place of install-skill. With no such vault, the refusal is unchanged. It still exits 2 and creates, registers and writes nothing. The lookup (vaultsBoundTo in the board store) reads the vault of each chosen checkout and each untracked vault, decoding boards in memory. The vault finder takes it as an optional lookup, because it cannot import the store. Only the command's own vault search uses it. The archboard and archboard-pr skills tell an agent to follow the named -C. Proven by vault-finding.test.ts (fails by mutation without the lookup) and a scratch-registry run. Command dispatch and Board persistence adopted TASK-480. Gate: bun run check passed at 66bf487bc. Commits 200481447, bda65700c, 66bf487bc.
<!-- SECTION:FINAL_SUMMARY:END -->
