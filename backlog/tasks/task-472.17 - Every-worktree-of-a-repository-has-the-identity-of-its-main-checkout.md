---
id: TASK-472.17
title: Every worktree of a repository has the identity of its main checkout
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 22:52'
updated_date: '2026-10-14 23:00'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git.ts: one identity rule. repoIdentityAt reads origin; with none it asks 'git worktree list --porcelain', whose first entry is always the main worktree (a bare repository is the first entry marked bare), and names the repository by that directory (a bare one without its .git suffix). repoIdentityFor(root, remote, worktreeListing) stays the one pure rule, so the synchronous vault-checkout caller (TASK-472.03 scope) can pass the listing too. worktreePaths and the rule share one porcelain parser.
2. repo-registry.ts: worktreesOf keeps its identity filter (a worktree can override origin with extensions.worktreeConfig) but its comment no longer says a remoteless worktree is another identity.
3. Tests: module test with real temp repos (no remote: main + linked worktree + worktree of a bare repo share one identity and become known together; remote: both share the remote identity); CLI test: repo add / repo use of a remoteless checkout makes its worktree known, choosing the worktree moves the chosen checkout of that one identity.
4. Docs: INSTALL.md (+ generated copy under skills/archboard/references/generated), repo add/use help in src/cli/commands/repo.ts; check skills/archboard wording.
5. Board: no dogfood board changes (Repository checkout part already says one identity per repository); verify by reading the board part.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Identity rule is repoIdentityFor(root, remote, worktreeListing?) in git.ts; repoIdentityAt asks git for the listing only when there is no remote. Bare repo: named by its directory without .git. worktreesOf keeps its identity filter (extensions.worktreeConfig can override origin per worktree). No dogfood board changes: the Repository checkout part already says worktrees of its identity. Cross-scope: src/runtime/code-target/lib/vault-checkout.ts calls repoIdentityFor(top, remote) without the listing, so a vault in a linked worktree of a remoteless repo still gets the worktree directory name until it passes gitAnswer(top, ['worktree','list','--porcelain']) as the third argument (TASK-472.03).
<!-- SECTION:NOTES:END -->
