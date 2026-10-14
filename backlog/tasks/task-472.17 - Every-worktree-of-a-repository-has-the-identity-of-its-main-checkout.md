---
id: TASK-472.17
title: Every worktree of a repository has the identity of its main checkout
status: To Do
assignee: []
created_date: '2026-10-14 22:52'
labels: []
dependencies: []
references:
  - docs/adr/0011-bindings-name-a-repository.md
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
parent_task_id: TASK-472
ordinal: 837000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A repository identity falls back to the name of the checkout's directory when the repository has no origin remote (repoIdentityAt). So each linked worktree of such a repository has an identity of its own, and since TASK-472.02 it is not known together with its main checkout: the review of TASK-472.02 made `git worktree list` add a worktree only when the identities match. The owner decided on 2026-10-15 that every worktree has the identity of its main checkout: with a remote that is the remote's identity, which worktrees share, and without one it is the name of the main checkout's directory. ADR 0011 carries the amendment and CONTEXT.md the definition.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a repository with no remote, a linked worktree has the same identity as its main checkout: the name of the main checkout directory
- [ ] #2 `repo add` or `repo use` of a checkout of a repository with no remote makes its linked worktrees known under that one identity, and choosing one of them changes the chosen checkout of that identity
- [ ] #3 A repository with an origin remote keeps the identity of its remote, in its main checkout and every worktree
- [ ] #4 INSTALL.md, the archboard skill and the help of the `repo` commands state the identity rule wherever they state where an identity comes from
- [ ] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
