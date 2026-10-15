---
id: TASK-472.07
title: >-
  Tests and skill evaluations make their vaults in the vault layout and address
  them with -C
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 04:17'
labels: []
dependencies:
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
ordinal: 827000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
System tests, fixtures and the skill evaluation harness point `ARCHBOARD_VAULT` at bare directories, which ADR 0049 removes. They move to `<dir>/.archboard/vault` and `-C`, keeping their own ports and state directories. The evaluation world keeps its vault inside its flask checkout, which changes the world that the evaluations measure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No test, fixture, test support module or evaluation harness sets or reads `ARCHBOARD_VAULT`
- [ ] #2 Every isolated server in tests and evaluations still has its own port, HOME, state directory and registry
- [ ] #3 The evaluation world's vault is `.archboard/vault` inside its flask checkout, and evals/README.md records that batches after this change are not directly comparable with earlier ones
- [ ] #4 `bun run check` passes
- [ ] #5 TESTING.md, docs/agents/test-suite.md, evals/README.md and the archboard-dev skill describe isolated servers as built
- [ ] #6 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Module tests under src/ (semantic-board-store, engine lock, code-check, server route tests, CLI command tests, codex-process storage, vault-finder): delete every ARCHBOARD_VAULT set/restore and the late imports kept only for it; in-process CLI tests address a temporary <dir>/.archboard/vault with -C and an isolated ARCHBOARD_REPOS, so no test touches the machine registry. The finder's environment-origin cases are removed: TASK-472.09 owns the refusal and its test.
2. System test support: one helper module names the vault layout. startOwnedServer takes a vault in the <holder>/.archboard/vault layout, keeps a registry of its own beside the vault unless the caller names one, and lists the vault in it before the server starts, so the page opens in that vault without ARCHBOARD_VAULT. runServerCli and the browser lane's CLI run in the holder with that registry. RepositoryFixture, package-cli, install-fixture, process-http, public-codex-startup and the server-start fixtures drop the variable and make their vaults in the layout.
3. System tests that proved environment behaviour (the environment origin of vault-finding, the environment vault in repositories and vault-naming, env forwarding assertions) are rewritten against the registry or removed where TASK-472.09 owns the refusal.
4. Skill evaluation: the run's vault becomes <flask>/.archboard/vault, created after the clone; the run environment drops ARCHBOARD_VAULT and the harness's CLI calls run in the flask checkout; reaudit reads batches from before and after; evals/README.md says batches after this change are not directly comparable with earlier ones.
5. Docs: TESTING.md (isolated session example), docs/agents/test-suite.md, evals/README.md and the archboard-dev skill (isolation parts only; TASK-472.08 owns the dogfood and port parts) describe isolated servers as built.
6. Boards: no dogfood board is affected unless the Skill evaluation board draws the run's vault; the parent draws any proposal.
7. Gate: bun run check with ARCHBOARD_REPOS pointing at a temporary file that must stay absent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handed over from the review of TASK-472.01 (2026-10-15): about 25 board-store tests, 3 engine lock tests and the code-check unit tests still set and restore process.env.ARCHBOARD_VAULT and load the store late for that reason, though nothing on their path reads it since the refactor. Delete the setup and restore, use static imports, and drop the now false comment that config.ts snapshots the environment in one-write.test.ts, aggregate-writes.test.ts and discard.test.ts.
<!-- SECTION:NOTES:END -->
