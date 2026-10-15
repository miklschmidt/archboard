---
id: TASK-472.09
title: A set ARCHBOARD_VAULT is refused
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 08:43'
labels: []
dependencies:
  - TASK-472.07
  - TASK-472.08
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 829000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the tests, the evaluations and `bin/dogfood` stop using it, `ARCHBOARD_VAULT` has no reader. ADR 0049 refuses it instead of ignoring it, so that an old `.envrc` or `.env` never quietly addresses another vault. `EXPRESS_SERVER_URL` is refused in the same way today. This is the contract step and the sweep of the removed variable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every command refuses while `ARCHBOARD_VAULT` is set, also when it comes from `.env`, and the refusal says that the vault is found from the working directory or `-C` and that a vault outside a checkout moves to `<dir>/.archboard/vault`
- [x] #2 No source file, document or shipped skill names `ARCHBOARD_VAULT` except the refusal, its test and history
- [x] #3 The README's examples use `-C` or a working directory
- [x] #4 README.md, INSTALL.md, TESTING.md, AGENTS.md, PRODUCT.md and the archboard, archboard-pr and archboard-dev skills hold no instruction that sets `ARCHBOARD_VAULT`, and `bun run generate:skill-artifacts` output matches
- [x] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. config.ts: removedEnvironmentMessage refuses a set ARCHBOARD_VAULT (env or .env, empty too) next to EXPRESS_SERVER_URL, exit 2, help exempt (src/bin.ts). 2. Remove every reader: vault finder environment search and the environment origin, CLI session default, pane.ts, server environmentVault/opening vault. 3. Vault layout decision: the server serves only <dir>/.archboard/vault (namedVault refuses any other readable directory with VAULT_UNREADABLE) so checkoutOfVault and checkoutNamedBy agree; owner src/server/archboard/tests/request-vault.test.ts. 4. Sweep scripts, tests (callerVaultCleared removed), docs, skills; README quick start copies the example into <dir>/.archboard/vault and registers it with repo add. 5. generate:skill-artifacts; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault-layout decision (gap two reviewers found): the server now serves only a vault in the <dir>/.archboard/vault layout. namedVault (src/server/archboard/lib/request-vault.ts) is the one entrance for a call's ?vault=, a body vault, the pane socket and a move's --to, and it refuses any other readable directory with VAULT_UNREADABLE (404) before anything is created. Why not make checkoutNamedBy accept a plain vault instead: it would let a coordinator delegation name any directory as a workhorse checkout, and a plain directory has no checkout to hold agent instructions, skills or a Codex configuration (ADR 0050). One rule at one entrance is smaller than two functions agreeing on a second layout. checkoutOfVault is now just dirname(dirname(vault)) with isVaultLayout beside it. Owner: tests/system/server-state/vault-naming.test.ts (plain readable directory is refused, nothing created in it) plus src/server/archboard/tests/codex-checkouts.test.ts (a directory in no layout names no checkout). Known edge: a .archboard/vault that is itself a symlink to a directory elsewhere canonicalizes to a non-layout path and is refused; nothing in the repo or tests links a vault that way.

Removed: ARCHBOARD_VAULT readers in config.ts, vault-finder (environment search, 'environment' origin, holder null), addressed-vault, pane.ts, server-client-session, repositories.ts (environmentVault, servedName), request-vault canonicalConfiguredVault. callerVaultCleared test helper removed (a set variable now fails loudly). scripts/build-pipeline-example.ts takes the vault directory as its argument; scripts/readme-assets/server.ts copies the vault into <take>/repository/.archboard/vault, registers it in a registry of the take's own (ARCHBOARD_REPOS) and runs the CLI with that directory as cwd. README quick start copies examples/web-shop to ~/archboard-example/.archboard/vault (examples/web-shop cannot hold the layout in place: inside the archboard checkout a command finds the checkout's own vault).

Board closing: proposals Command dispatch@TASK-472.09, Command interface@TASK-472.09 (carries TASK-471.03's install-skill parts) and Archboard server routes@TASK-472.09 corrected to what was built and adopted. Code check read with and without the variable's --variant for TASK-472.09: the only difference is a cleared warning (ANCHOR_SYMBOL_MISSING on the removed canonicalConfiguredVault anchor); no finding introduced. Footprint read against base facb060e4 (parent of the first code commit f57fab66c; that commit is large because it sweeps tests, scripts and docs but is the feature itself). Commands named as built: Vault finder (also refuses a vault linked out of the layout, VAULT_NOT_FOUND reason vault-outside-layout), Panes (a pane's and a shown board's checkout is always the directory that holds the vault), Repository listing (a linked-out vault is no vault; no registry entry means no repository name), Vault requirement (the layout refusal tells the caller to move the boards). Not added, decided: Command routing and Addressed vault (only addressed-vault.ts changed inside, and it is named); Checkout registry (89b441d01 changed a comment in repo-registry.ts, a TASK-471.03 commit); Command contract (f57fab66c reworded the VAULT_NOT_FOUND refusal description in command-contract/lib/common.ts); a Vault finder part on the server routes board (the code check then asked for relationships from Checkout registry and Codex workbench; the board's question does not need it, so the layout rule is stated in Vault requirement and Repository listing). Behind boards corrected in place: Agent workbench (Workhorse checkouts: a path names the checkout of the vault it resolves to by real path in the layout, from a79cdac27), Archboard server and Live panes (Vault requirement refuses a directory outside the layout), Live panes (Repository list: no repository name for an unregistered vault, a checkout for every vault, a linked-out vault not listed). Archboard (Repository checkout) is behind only by a comment edit (89b441d01) and stays right; Browser application is behind only by TASK-472.11 commits.

Review: four reviewers (refusal and layout code, install-skill, docs and README quick start, vault producers against the layout rule). Fixes: a79cdac27 (checkoutNamedBy resolves a directory's vault by real path and the layout rule), 2f6f090d7 (a pane's checkout is always the directory that holds its vault; layoutHolder removed), 10bfa0ca6 (the vault finder refuses a vault linked out of the layout before it registers anything), 4ea5feee9 (a linked-out vault is not listed ready), a93feacfe (the layout refusal says to move the boards), 1c64ffd65, 00cdf3949, d7b56b870, 944569b16 (docs and the voice-acceptance cleanup forget the run's registry entry). The README quick start was followed as written in a temporary home with an isolated registry and port. The remaining mentions of the variable outside history are the refusal (config.ts), its tests, run-world.test.ts, and the text in AGENTS.md and INSTALL.md (and so the skill's generated INSTALL.md copy) that describes the refusal, which criterion #2 allows. Proposals adopted in a4496d8d3. Gate: bun run check passed on a4496d8d3 (test:modules 4680 pass, test:system 239 pass, test:repository 27 pass, serial browser lane exit 0).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 03:38
---
From TASK-472.06: README.md's quick start still runs `ARCHBOARD_VAULT="$PWD/examples/web-shop" ./bin/archboard start`. Refusing the variable breaks it, and examples/web-shop is not in the <dir>/.archboard/vault layout, so the example needs a new home or a -C form before this task lands. The archboard-pr skill's description also still triggers on a repository whose agent doc names ARCHBOARD_VAULT (TASK-471.03).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every command except help refuses a set ARCHBOARD_VAULT with exit 2, also from .env, and says that the vault is found from the working directory or -C and that a vault outside a checkout moves to <dir>/.archboard/vault. The variable has no other reader: the vault finder has no environment origin, and the server's served vault and repository listing no longer read it. The server serves only vaults in the <dir>/.archboard/vault layout, the CLI refuses a vault linked out of it before registering it, and a delegation names the same checkout that a pane's vault has. The README quick start copies the example into ~/archboard-example/.archboard/vault and uses -C. Verified by removed-environment.test.ts, vault-finder.test.ts, vault-naming.test.ts, repositories.test.ts, codex-checkouts.test.ts, a hand run of the quick start, four reviews and the full gate on a4496d8d3.
<!-- SECTION:FINAL_SUMMARY:END -->
