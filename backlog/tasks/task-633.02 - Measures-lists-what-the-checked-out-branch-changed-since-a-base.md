---
id: TASK-633.02
title: Measures lists what the checked-out branch changed since a base
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-13T00:29:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-633
type: feature
ordinal: 1076000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-633

## What to build

Measures gets a fourth view, `What this branch changed`. A searchable list chooses the base from a new route that lists the local and remote branches of every repository that the selected state binds, merged by name. The base defaults to the vault repository's `origin/HEAD`, else `main`. In this ticket the head is the checked-out head, which sends no head, and the footprint is set against the state on screen.

The view shows the footprint: with a proposal, the three lists with `Changed but not named` first; without one, the changed modules. Each module shows its commits, why the proposal names it, and the changed modules it holds. The view also shows large commits, skipped modules with their reason, changed files that no module binds, and the base, merge base and head commit of each repository, or why a repository was not read. It reads when the view opens and on Refresh only. The browser keeps one answer for each model revision, base, head and state. With a checkpoint on screen, the view is disabled and says why. A row selects its own module, as the other Measures rows do.

TASK-633 holds the full contract and the test seams. This ticket uses the ref listing of seam 2 and the list part of seam 3.

## Architecture

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`.
- Slice:
  - Added `vKEsyHFk#LD4pDpP7` Architecture history routes
  - Added `vKEsyHFk#TYdGeADR` Branch footprint
  - Changed `vKEsyHFk#tQ2B3iEF` Measures: holds the fourth view
  - Changed `vKEsyHFk/HBlhIeSD#radK8osF` History lens: lists source refs (TASK-633.03 owns its reading at the head)
  - Added relationships Architecture history routes to History lens, Model queries (`vKEsyHFk#guvtYApo`) to Architecture history routes, Branch footprint to Model queries, and Measures to Branch footprint
  - Added flow `vKEsyHFk#ENwNxHw2` Read what a branch changed, with its steps
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8&grammarA=sequence&flowA=vKEsyHFk%23ENwNxHw2
- Gate: before this ticket merges, `archboard model footprint --base worktree-branch-footprint-view --head <ticket-branch> --state a5K6IbA8 --fail-outside` exits 0, run in the worktree of the integration branch. After TASK-633.03 lands, the gate also passes `--model-at checkout`. Each module in `namedAndChanged` is in this slice.

## Blocked by

None (can start immediately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Measures has a fourth view, `What this branch changed`, and it reads only when it opens and when the reader presses Refresh
- [x] #2 A new route lists the local and remote branches of every repository that the selected state binds, merged by name with the repositories that hold each, plus the default base and the vault checkout's branch or detached commit, without fetching and without tags
- [x] #3 The base list is searchable, defaults to `origin/HEAD`, else `main`, and accepts a typed ref that no entry matches
- [x] #4 With a proposal on screen, the view shows the three lists with `Changed but not named` first, and without one it shows the changed modules
- [x] #5 The view shows each module's commits, the reason the proposal names it and the changed modules it holds, the large commits, the skipped modules with their reason, the unbound files, and each repository's range or why it was not read
- [x] #6 The browser reuses an answer for the same model revision, base, head and state, and never reads while the view is closed
- [x] #7 With a checkpoint on screen, the view is disabled and says that a checkpoint is not live
- [x] #8 A row selects its own module, as the other Measures rows do
- [x] #9 DESIGN.md describes the view and its searchable list
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implementer (worktree): the history lens lists the source refs of every bound repository, merged by name, with the default base and the checked-out head; GET /api/architecture/refs; seam 2 tests for the listing.
2. Parent: the browser footprint and refs queries; the Measures view What this branch changed with the base list, the lists, Refresh and the checkpoint state; DESIGN.md; the browser owner.
3. Gate, review, merge into the integration branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate: the refs schema sits in the shared protocol of code-intel, and the CLI history lines needed a type fix. Both are recorded as an exception on the proposal.
Fix from looking at the view: the reasons under a row repeated each line and flow step with raw ids. They are now counted by kind and standing.
Proof: tests/system/browser/reader-branch-footprint.test.ts (no read before the view opens, base defaults to main, three lists against a plan, Refresh reads the new commit, reopening reads nothing, a row selects its module). Source refs tests pass. Screenshots in both themes: origin/main as the default base in this repository, the typed-ref row, and the checkpoint notice.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measures has a fourth view, What this branch changed. It reads the footprint from a base (origin/HEAD, else main, or any typed ref) to the head of each checkout, only while open and on Refresh. With a proposal it shows Changed but not named, Named and changed and Named but not changed, else Changed. Rows select their module. Lines under the lists say each range and what was not read. GET /api/architecture/refs lists the branches. DESIGN.md describes the view and its searchable list.
<!-- SECTION:FINAL_SUMMARY:END -->
