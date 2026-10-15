---
id: TASK-472.07
title: >-
  Tests and skill evaluations make their vaults in the vault layout and address
  them with -C
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 04:51'
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

Built (2026-10-15):
- tests/system/support/test-vault.ts names the layout: vaultIn(<dir>) makes <dir>/.archboard/vault, holderOf(vault) refuses a vault outside the layout, listOnlyVault(registry, vault) writes a registry that lists one untracked vault.
- startOwnedServer keeps a registry of its own in its namespace and lists only its vault there, so /api/served-vault is that vault without ARCHBOARD_VAULT. A caller that names ARCHBOARD_REPOS keeps its own registry, and nothing is added to it. OwnedServer.registry names the one in use.
- runServerCli (tests/system/support/run-cli.ts) and the browser CLI helper take the server, run in the vault's holder and pass the server's registry. Running in the holder (not -C) because -C is refused on start, stop, status and browser panes/open.
- RepositoryFixture keeps its vault at <root>/boards/.archboard/vault (outside nowhere); its unused run() is removed. package-cli keeps its vault at <outside>/.archboard/vault. install-fixture names no vault, so install-skill suggests <repo>/.archboard/vault. process-http drops the vault and its unused CLI helpers; the lock peer gets its vault through ARCHBOARD_TEST_LOCK_VAULT.
- Module tests under src/ no longer set ARCHBOARD_VAULT; in-process CLI tests use -C <tmp> and an isolated ARCHBOARD_REPOS.
- Skill evaluation: the run's vault is <world>/flask/.archboard/vault, made after the clone; runEnvironment names no vault; registerRepo:false fixtures forget the checkout after the snapshot; reaudit reads old batches at world/vault; guardrails and classify resolve board paths under the checkout.
Removed owners (TASK-472.09 owns the refusal of the variable): the environment-origin cases of vault-finder.test.ts and tests/system/cli/vault-finding.test.ts, the env-suggested vault case of install-targets, the environment-vault naming assertion of repositories.test.ts, the ARCHBOARD_VAULT served-vault assertion of vault-naming.test.ts, the no-vault start mode of local-bind (every server now starts without one).
Left: install-targets still asserts that the setup block exports ARCHBOARD_VAULT (product output until TASK-471.03). Production readers (config.ts, repositories.ts environmentVault, addressed-vault, repo-setup-block, scripts/readme-assets/server.ts, scripts/build-pipeline-example.ts) are TASK-472.09's sweep and now have no test owner.
Boards: no dogfood board was edited. The Skill evaluation board's "Per-run server" (PEfE7dCL) and "Archboard server" (EJ2b3Szn) say the server runs against the run's vault; it now starts with none and each call names the run's vault.
Gate: bun run check exit 0 with ARCHBOARD_REPOS=/tmp/t07-gate-repos.json, which no test created.
<!-- SECTION:NOTES:END -->
