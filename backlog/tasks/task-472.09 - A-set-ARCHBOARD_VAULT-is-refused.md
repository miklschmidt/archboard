---
id: TASK-472.09
title: A set ARCHBOARD_VAULT is refused
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 07:38'
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
- [ ] #1 Every command refuses while `ARCHBOARD_VAULT` is set, also when it comes from `.env`, and the refusal says that the vault is found from the working directory or `-C` and that a vault outside a checkout moves to `<dir>/.archboard/vault`
- [ ] #2 No source file, document or shipped skill names `ARCHBOARD_VAULT` except the refusal, its test and history
- [ ] #3 The README's examples use `-C` or a working directory
- [ ] #4 README.md, INSTALL.md, TESTING.md, AGENTS.md, PRODUCT.md and the archboard, archboard-pr and archboard-dev skills hold no instruction that sets `ARCHBOARD_VAULT`, and `bun run generate:skill-artifacts` output matches
- [ ] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. config.ts: removedEnvironmentMessage refuses a set ARCHBOARD_VAULT (env or .env, empty too) next to EXPRESS_SERVER_URL, exit 2, help exempt (src/bin.ts). 2. Remove every reader: vault finder environment search and the environment origin, CLI session default, pane.ts, server environmentVault/opening vault. 3. Vault layout decision: the server serves only <dir>/.archboard/vault (namedVault refuses any other readable directory with VAULT_UNREADABLE) so checkoutOfVault and checkoutNamedBy agree; owner src/server/archboard/tests/request-vault.test.ts. 4. Sweep scripts, tests (callerVaultCleared removed), docs, skills; README quick start copies the example into <dir>/.archboard/vault and registers it with repo add. 5. generate:skill-artifacts; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault-layout decision (gap two reviewers found): the server now serves only a vault in the <dir>/.archboard/vault layout. namedVault (src/server/archboard/lib/request-vault.ts) is the one entrance for a call's ?vault=, a body vault, the pane socket and a move's --to, and it refuses any other readable directory with VAULT_UNREADABLE (404) before anything is created. Why not make checkoutNamedBy accept a plain vault instead: it would let a coordinator delegation name any directory as a workhorse checkout, and a plain directory has no checkout to hold agent instructions, skills or a Codex configuration (ADR 0050). One rule at one entrance is smaller than two functions agreeing on a second layout. checkoutOfVault is now just dirname(dirname(vault)) with isVaultLayout beside it. Owner: tests/system/server-state/vault-naming.test.ts (plain readable directory is refused, nothing created in it) plus src/server/archboard/tests/codex-checkouts.test.ts (a directory in no layout names no checkout). Known edge: a .archboard/vault that is itself a symlink to a directory elsewhere canonicalizes to a non-layout path and is refused; nothing in the repo or tests links a vault that way.

Removed: ARCHBOARD_VAULT readers in config.ts, vault-finder (environment search, 'environment' origin, holder null), addressed-vault, pane.ts, server-client-session, repositories.ts (environmentVault, servedName), request-vault canonicalConfiguredVault. callerVaultCleared test helper removed (a set variable now fails loudly). scripts/build-pipeline-example.ts takes the vault directory as its argument; scripts/readme-assets/server.ts copies the vault into <take>/repository/.archboard/vault, registers it in a registry of the take's own (ARCHBOARD_REPOS) and runs the CLI with that directory as cwd. README quick start copies examples/web-shop to ~/archboard-example/.archboard/vault (examples/web-shop cannot hold the layout in place: inside the archboard checkout a command finds the checkout's own vault).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 03:38
---
From TASK-472.06: README.md's quick start still runs `ARCHBOARD_VAULT="$PWD/examples/web-shop" ./bin/archboard start`. Refusing the variable breaks it, and examples/web-shop is not in the <dir>/.archboard/vault layout, so the example needs a new home or a -C form before this task lands. The archboard-pr skill's description also still triggers on a repository whose agent doc names ARCHBOARD_VAULT (TASK-471.03).
---
<!-- COMMENTS:END -->
