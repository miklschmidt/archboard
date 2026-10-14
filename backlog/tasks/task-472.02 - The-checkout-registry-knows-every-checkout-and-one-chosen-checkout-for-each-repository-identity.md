---
id: TASK-472.02
title: >-
  The checkout registry knows every checkout and one chosen checkout for each
  repository identity
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
