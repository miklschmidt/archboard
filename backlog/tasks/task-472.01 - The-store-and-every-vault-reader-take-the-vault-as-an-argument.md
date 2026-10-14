---
id: TASK-472.01
title: The store and every vault reader take the vault as an argument
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 821000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every reader of the vault reaches it through one process-wide default, `requireVaultRoot()`, which `config.ts` reads from `ARCHBOARD_VAULT` once at import. ADR 0049 makes one server serve many vaults, so each reader must be told which vault it reads. This is the prefactor of the migration: the server still serves exactly one vault, and nothing visible changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No function of the board store, the lock and lease state, the board catalogue, the vault configuration, former-name lookup, board listing, board location, vault diagnostics or the code check has a default vault: each takes the vault root from its caller
- [ ] #2 The process-wide vault is read in one place for the server and one place for the CLI, and passed down from there
- [ ] #3 Behaviour is unchanged: existing tests pass, changed only where a test called a function without a vault
- [ ] #4 AGENTS.md, docs/agents/boundaries.md and the archboard-dev skill say nothing that this refactor made false
- [ ] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
