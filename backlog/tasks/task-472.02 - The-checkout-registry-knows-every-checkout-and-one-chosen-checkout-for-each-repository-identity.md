---
id: TASK-472.02
title: >-
  The checkout registry knows every checkout and one chosen checkout for each
  repository identity
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-14 22:04'
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
ordinal: 822000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The registry holds one checkout per repository identity, so two worktrees or two clones of one repository cannot both be known, and nothing can say which one this machine reads. ADR 0049 makes the registry hold every known checkout and untracked vault and one chosen checkout per identity. The owner wants `repo use` so that adding a checkout never changes what the machine reads. Later tasks register by first use and choose from the browser; this task gives them the registry and the commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `repo add <dir>` registers a checkout and does not change the chosen checkout of its identity, except that the first known checkout of an identity becomes its chosen checkout
- [ ] #2 `repo add <dir>` on a directory outside any git checkout that holds `.archboard/vault` registers an untracked vault with a registry name: the base name of the directory, made unique on this machine
- [ ] #3 `repo use <dir>` makes that checkout the chosen checkout of its identity, registering it first when it is unknown
- [ ] #4 The worktrees that `git worktree list` reports for a known checkout are known checkouts
- [ ] #5 `repo list` reports each known checkout with its identity and each untracked vault with its registry name, whether it is chosen, and whether its directory exists
- [ ] #6 `repo forget <dir>` removes a checkout or an untracked vault. If it removes the chosen checkout of an identity, that identity has no chosen checkout until `repo use`, `repo list` says so, and its bindings resolve as unregistered
- [ ] #7 A `repos.json` written by an earlier version reads without a manual step: each entry becomes a known checkout that is chosen for its identity, and a legacy `observed` source stays readable
- [ ] #8 Every reader that resolved a repository identity to a checkout (code targets, the code check, behind, footprint, locality, language servers) resolves it to the chosen checkout, with unchanged results when an identity has one checkout
- [ ] #9 INSTALL.md, the help of the `repo` commands, the archboard skill and AGENTS.md describe `repo add`, `repo use`, `repo list` and `repo forget` as built, and CONTEXT.md's Checkout registry and Chosen checkout match the behaviour
- [ ] #10 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Registry model (src/runtime/engine/repo-registry.ts, new lib/registry-file.ts): repos.json stays a bare array of entries keyed by directory. A checkout entry is {repo, root, source, addedAt, chosen, servers?}; an untracked vault entry is {name, root, addedAt}. An entry with no 'chosen' field is a legacy entry and reads as chosen (first per identity), so a legacy file reads with no migration and is not rewritten by a read; 'observed' stays readable. At most one chosen checkout per identity is enforced on read.
2. Operations: declareDirectory(dir,{choose,signal}) (checkout -> register + git worktree list worktrees; else untracked vault with unique base-name registry name; 'choose' = repo use), forgetDirectory(dir), setLanguageServer(root,...), chosenCheckouts() (what readers resolve: one checkout per identity), checkoutFor(identity), listRegistry() for repo list. First known checkout of an identity becomes chosen; repo add never changes a choice; forgetting the chosen leaves the identity unchosen until repo use.
3. Readers: code-target snapshot, code-check, history-lens and bindings all go through chosenCheckouts()/checkoutFor(), so they resolve to the chosen checkout; unregistered message names repo use. Language server config: --repo resolves to the chosen checkout, the working-directory form configures the known checkout it stands in.
4. CLI: new repo use <dir>; repo add <dir> handles untracked vaults; repo forget <dir>; repo list reports chosen/exists per checkout, vaults with names, and identities with no chosen checkout.
5. Tests: registry module contract tests (chosen rules, worktrees, vault names, forget, legacy read), extend the legacy-registration test, resolver test with two checkouts of one identity, a CLI system test with temporary clones and worktrees.
6. Docs: INSTALL.md, AGENTS.md if it names repo commands, skills/archboard + archboard-dev, CONTEXT.md only if it differs; generate:skill-artifacts; evals inputs only if a scenario depends on repo forget <identity>.
7. Boards: Archboard (Repository checkout datastore: now every checkout + chosen; Agent CLI description) and Command interface (Repositories node gains repo use). Proposals Archboard@TASK-472.02 and Command interface@TASK-472.02. No other board is affected.

8. Board proposals (drawn with the plan): Archboard@TASK-472.02 (Repository checkout: every checkout, chosen for each repository, untracked vaults; Agent CLI description; the two relationships anchored on chosenCheckouts and declareDirectory) and Command interface@TASK-472.02 (Repositories: repo use, choosing and forgetting). No other board is affected: the readers (code opener, code check, history lens) keep their parts and only change which checkout they are handed.
<!-- SECTION:PLAN:END -->
