---
id: TASK-633.04
title: The reader picks any head and the state it is set against
status: Done
assignee: []
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-13T00:43:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-633.03
  - TASK-633.02
parent_task_id: TASK-633
type: feature
ordinal: 1078000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-633

## What to build

The view `What this branch changed` gets a searchable head list and an `Against` list. The head list starts with the checked-out entry, which sends no head and is labelled with the vault checkout's branch, or with its commit for a detached HEAD. Every entry names the repositories that hold it, and a typed ref that no entry matches is offered as `Use "<text>"`.

`Against` lists the current state and every active proposal of the vault that will be read. Its default is the state on screen if that vault has it. If not, it is the one proposal that the head adds over the base: a proposal in the vault at the head and not in the vault at the merge base. If there is no such single proposal, it is the current state. The view names the vault that the answer read.

TASK-633 holds the full contract and the test seams. This ticket uses the picker part of seam 3.

## Architecture

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`.
- Slice:
  - No subject of its own. It changes Branch footprint (`vKEsyHFk#TYdGeADR`), which TASK-633.02 adds, and uses Model queries (`vKEsyHFk#guvtYApo`)
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8&focusA=vKEsyHFk%23TYdGeADR,vKEsyHFk%23guvtYApo
- Gate: before this ticket merges, `archboard model footprint --base worktree-branch-footprint-view --head <ticket-branch> --state a5K6IbA8 --fail-outside` exits 0, run in the worktree of the integration branch. After TASK-633.03 lands, the gate also passes `--model-at checkout`. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-633.03
- TASK-633.02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The head list is searchable, starts with the checked-out entry labelled with its branch or detached commit, names the repositories that hold each entry, and accepts a typed ref
- [x] #2 Choosing the checked-out entry sends no head, and choosing any other entry sends it
- [x] #3 `Against` lists the current state and every active proposal of the vault that will be read
- [x] #4 `Against` defaults to the state on screen when that vault has it, else to the one proposal that the head adds over the base, else to the current state
- [x] #5 The view names the vault that the answer read
- [x] #6 DESIGN.md describes the head and `Against` lists
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Against reads the states of the vault the footprint will read: the model at the head through the branch reading, and the vault on disk when that read answers SOURCE_REF_NOT_FOUND, which is how the server decides.
The merge-base default reads the range from the refs route and the model at the merge-base commit, only when the vault at the head lacks the state on screen.
Choosing a head clears a chosen Against, because another vault can be read.
Proof: tests/system/browser/reader-branch-footprint.test.ts chooses a head that is not checked out and finds Against set to the one proposal that head adds, with the answer naming a vault read at a ref. Screenshots: the head list with the checkout first, and Against falling back to Current at main.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The view has a searchable head list, with the checkout first, and an Against list of the current state and the proposals of the vault that will be read. Against defaults to the state on screen when that vault holds it, else to the one proposal the head adds over the merge base, else to the current state. The view names the model the answer read. DESIGN.md describes both lists.
<!-- SECTION:FINAL_SUMMARY:END -->
