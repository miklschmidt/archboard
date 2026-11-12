---
id: TASK-633.04
title: The reader picks any head and the state it is set against
status: To Do
assignee: []
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-12T23:50:00Z'
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
- [ ] #1 The head list is searchable, starts with the checked-out entry labelled with its branch or detached commit, names the repositories that hold each entry, and accepts a typed ref
- [ ] #2 Choosing the checked-out entry sends no head, and choosing any other entry sends it
- [ ] #3 `Against` lists the current state and every active proposal of the vault that will be read
- [ ] #4 `Against` defaults to the state on screen when that vault has it, else to the one proposal that the head adds over the base, else to the current state
- [ ] #5 The view names the vault that the answer read
- [ ] #6 DESIGN.md describes the head and `Against` lists
<!-- AC:END -->
