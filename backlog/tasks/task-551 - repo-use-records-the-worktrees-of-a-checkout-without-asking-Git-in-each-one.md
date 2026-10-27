---
id: TASK-551
title: repo use records the worktrees of a checkout without asking Git in each one
status: Done
assignee: []
created_date: '2026-10-26T10:55:00Z'
updated_date: '2026-10-26T11:38:00Z'
labels: []
dependencies: []
references:
  - packages/workspace/src/runtime/store/repo-registry.ts
  - packages/workspace/src/runtime/clients/git.ts
priority: medium
type: bug
ordinal: 960000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a checkout with many worktrees, `archboard repo use` and `repo add` fail with "Git command timeout" and record nothing. `/home/msc/Projects/archboard` has about 180 worktrees. `worktreesOf` in `packages/workspace/src/runtime/store/repo-registry.ts` inspects every worktree with `Promise.all`, and each inspection runs four or five Git commands. Each Git command runs under its own Bun owner process, so one declaration starts more than 700 Git commands at the same time. One of them passes its 5 s bound (`GIT_MS.command`), and that fails the whole command. It failed at every attempt during the PR #2 work, also at a load of 6, so the chosen checkout of the archboard repository could only be moved back through the navigator menu. Only the root and the identity of each worktree are recorded. `git worktree list --porcelain` in the checkout already gives every root, and every worktree has the identity of its checkout unless one of the two keeps a config of its own (`config.worktree`, under `extensions.worktreeConfig`) that can name another `origin`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Declaring a checkout (`repo add`, `repo use`) records each of its worktrees and runs no Git command in a worktree when neither that worktree nor the checkout keeps a config of its own
- [x] #2 A worktree whose own config names another `origin` than its checkout is still left out as another repository
- [x] #3 Tests own both behaviors: `tests/system/cli/repo-checkouts.test.ts` for no Git command in a worktree, because only a process started with a stand-in `git` on its PATH can see where Git runs, and `packages/workspace/tests/runtime/store/repo-registry.test.ts` for the identity and root of a worktree that keeps a config of its own
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the worktree reading into the Git client (`worktreesOf` in `packages/workspace/src/runtime/clients/git.ts`): one `git worktree list --porcelain` in the checkout gives every root, made real with the filesystem as `declareDirectory` makes its target real.
2. A listed worktree takes the identity of its checkout and its listed root when both share one git directory (`commondir`) and neither keeps a `config.worktree`. This reads only files, with no Git command. Git inspects any other worktree with `inspectCheckout`, one at a time.
3. Remove the per-worktree `inspectCheckout` of `repo-registry.ts` and the `worktreePaths` export it replaces.
4. Tests: a worktree with its own `origin`, a worktree whose own config moves its root, and a `.git` that names another repository, in the registry test. No Git command in a worktree, in the CLI system test.
5. No board changes: no board anchors `worktreesOf`, `worktreePaths` or `inspectCheckout`, and the boards draw the registry as a part that records checkouts.
6. `bun run check`, review, PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on /home/msc/Projects/archboard with a throwaway ARCHBOARD_REPOS registry: `repo add` recorded the same 196 entries as the old code in 0.4 s, against 12.7 s for the old code at load 19. The old code failed with "Git command timeout" during the PR #2 work.

Review (gpt-6.1-sol, xhigh) made five commits on fix/worktree-listing. Kept: 4c281ad85 (a worktree that Git must inspect goes through inspectCheckout, so a config of its own that moves its root or makes it bare counts) and 3b6efc98d (the shortcut needs a .git that names a git directory of the same repository, read through commondir, with no Git command). Reworked in 74fcdab9a into `ownGitDirectory`, `commonGitDirectory` and `listedWorktree`, to keep the complexity limit, with one test case each.

Left out:
- ebc531523 (any includeIf in the effective config sends every worktree to a full inspection). The owner's ~/.config/git/config has `includeIf "gitdir:/home/msc/Work/"`, so on the checkout this task is about, the reviewed branch took 16.1 s, slower than the old code. A conditional include that gives one worktree another origin is a state nobody reported.
- 3859d158b (inspect every worktree when GIT_WORK_TREE is set). The workspace Git runner passes GIT_WORK_TREE to every Git call, including the inspection of the checkout itself, so a guard in worktreesOf alone does not make that state correct. Its test recorded no worktree under GIT_WORK_TREE, which is the old degenerate result.
- 900c39365 (move the no-Git-in-a-worktree check from the CLI system test into the registry test, through `bun --eval` subprocesses). Bun.spawn keeps the environment the process started with, so the registry test needs extra processes to see a stand-in git. The CLI test sees it with the `repo add` it already runs. AC 3 now names that owner.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`repo add` and `repo use` read the worktrees of a checkout from one `git worktree list --porcelain` in the checkout (`worktreesOf` in packages/workspace/src/runtime/clients/git.ts). A listed worktree takes the identity of its checkout and its listed root when both share one git directory and neither keeps a `config.worktree`. That reading uses files only. Git inspects any other worktree with `inspectCheckout`, one at a time. Before, every worktree was inspected at the same time with four or five Git commands each, and on a checkout with about 190 worktrees one command passed its 5 s bound and the declaration failed.

Verification: `bun run check` passed on 74fcdab9a (test:modules 4998 pass, test:system 285 pass, test:repository 153 pass, browser lane passed). `tests/system/cli/repo-checkouts.test.ts` fails on main and passes here. On /home/msc/Projects/archboard, `repo add` recorded the same 196 entries as the old code in 0.4 s against 12.7 s.

Risk: a conditional include (`includeIf`) in the effective config could give one worktree another `origin`. The shortcut does not read conditional includes, so it would record that worktree under the identity of its checkout. The notes say why the review fix for that case was left out.
<!-- SECTION:FINAL_SUMMARY:END -->
