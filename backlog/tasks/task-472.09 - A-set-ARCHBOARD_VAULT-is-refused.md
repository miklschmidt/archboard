---
id: TASK-472.09
title: A set ARCHBOARD_VAULT is refused
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 03:38'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 03:38
---
From TASK-472.06: README.md's quick start still runs `ARCHBOARD_VAULT="$PWD/examples/web-shop" ./bin/archboard start`. Refusing the variable breaks it, and examples/web-shop is not in the <dir>/.archboard/vault layout, so the example needs a new home or a -C form before this task lands. The archboard-pr skill's description also still triggers on a repository whose agent doc names ARCHBOARD_VAULT (TASK-471.03).
---
<!-- COMMENTS:END -->
