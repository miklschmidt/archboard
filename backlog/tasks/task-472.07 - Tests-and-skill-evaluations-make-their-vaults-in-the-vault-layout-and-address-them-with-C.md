---
id: TASK-472.07
title: >-
  Tests and skill evaluations make their vaults in the vault layout and address
  them with -C
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 05:04'
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

Board proposal (2026-10-15): Skill evaluation@TASK-472.07 (variant tgP6SniP, branched from TASK-367.27 x68m5AbH), adopted as version 20. No other board is affected: the other task commits touch tests, test support and docs, which no board draws (.archboard/README.md).
- Proposal content (semantic compare, no interface change on Evaluation harness): Per-run server (PEfE7dCL) and Archboard server (EJ2b3Szn) responsibilities now say the server starts with no vault and every call names the run's vault; Run vault (WbFIRpiE) responsibility adds forgetting a checkout the fixture leaves unregistered (forgetCheckout); descriptions added to Run isolation (vault is .archboard/vault in the Flask checkout, made after the clone, environment names no vault), Exposure re-audit (old batches keep the vault at world/vault, vaultOf), Command classifier (a board read is not a code read, .archboard/vault names the vault), Guardrails (board paths resolve from the checkout, or the vault after a cd) and Agent CLI (finds the run's vault from the checkout it runs in); labels of ovGUX3xQ (Guardrails -> Command classifier), UcQvakTJ (Author run -> Run vault) and Tt8yC8yW (Agent CLI -> Archboard server); beat 0oIkDlI0 body says the vault sits in the checkout. Anchors kept: unwrapped, layFixture and fetch still hold. Summary kept as the board's scope.
- check --code diff, with and without --variant TASK-472.07: no line differs (no finding introduced or cleared). The one Skill evaluation finding in both runs is the existing EXPOSED_UNUSED on Evaluation harness; the task's new exports (checkoutOf, namesVault, forgetCheckout) are not among the names it lists.
- Footprint base 2d678a94f (parent of the first Refs: TASK-472.07 code commit f247d3f74); current was the proposal's parent. namedAndChanged: Run isolation, Author run (by relationship), Guardrails, Run vault, Command classifier, Exposure re-audit.
- changedNotNamed: Evaluation inputs (evals, bd8ce100f) - only evals/README.md changed, the inputs themselves and what the part is for did not, so the board stays true. Evaluation harness (directory container, 282d6d371, 898a65ce6, 5d8e1ec0d) - every changed lib file is named inside it; the rest are tests (run-world, evidence, vault-in-checkout).
- namedNotChanged: Per-run server (server.ts) - not a deviation. server.ts is unchanged, but it starts the server with the environment Run isolation builds, and runEnvironment no longer sets ARCHBOARD_VAULT (282d6d371), so its responsibility became false through isolation.ts. The header comment of src/runtime/skill-evaluation/lib/server.ts still says "against the run's vault" and is left for a code change.
- Skipped: Agent CLI and Archboard server are drill-downs to Command interface and Archboard server, where this task has no proposal; Codex CLI and Claude CLI are unbound.
- archboard check after adoption: 0 diagnostics. The proposal edit warned WALKTHROUGH_VIEW_MISSING for all seven beats, as the current variant already lacked views; left as is, because neither board view holds every beat's subjects.
- behind after adoption: Skill evaluation 0 commits. Task commits put Agent workbench (Codex process, d59c823f6), Archboard server (Archboard server 5db5d9af4, Code check 4713df8d1), Archboard server routes (Code check 4713df8d1), Board persistence (Board store f247d3f74) and Command interface (Commands 0e6c67343) behind; each of those commits changes only test files, so the boards stay right. Other behind entries are other tasks' commits.
<!-- SECTION:NOTES:END -->
