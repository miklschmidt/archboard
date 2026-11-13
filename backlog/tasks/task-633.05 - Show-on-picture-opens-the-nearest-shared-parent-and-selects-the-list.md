---
id: TASK-633.05
title: Show on picture opens the nearest shared parent and selects the list
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-13T00:43:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-633.01
  - TASK-633.04
parent_task_id: TASK-633
type: feature
ordinal: 1079000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-633

## What to build

Each list of the view `What this branch changed` gets `Show on picture`. It finds the nearest shared parent of the list's modules in the reading that it will open, and opens that module. If the modules share no parent, it opens the root reading. When the head is not checked out, it opens the head's branch reading, with `Against` as its state.

It then selects each listed module that the picture draws, and each drawn module that holds a listed module. This is the ordinary selection, which lasts until the next selection. The picture gains no new mark. The reader can expand a lit module or go through its door.

TASK-633 holds the full contract and the test seams. This ticket uses the `Show on picture` part of seam 3. When it is done, the ADR 0045 amendment of 2026-11-13 goes to the user for acceptance.

## Architecture

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`.
- Slice:
  - Added relationship Branch footprint (`vKEsyHFk#TYdGeADR`) to Model address (`vKEsyHFk/yejBBUFY#w46oCRoH`)
  - Added flow `vKEsyHFk#I4QPD0zt` Show a branch footprint on its picture, with its steps
  - Endpoint modules: Reading stage (`vKEsyHFk#p0EDMxTr`), Model queries, Canonical model routes, Read entry and Branch reading
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8&grammarA=sequence&flowA=vKEsyHFk%23I4QPD0zt
- Gate: before this ticket merges, `archboard model footprint --base worktree-branch-footprint-view --head <ticket-branch> --state a5K6IbA8 --fail-outside` exits 0, run in the worktree of the integration branch. After TASK-633.03 lands, the gate also passes `--model-at checkout`. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-633.01
- TASK-633.04
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each list has `Show on picture`, which opens the nearest shared parent of its modules, or the root reading when they share none
- [ ] #2 With a head that is not checked out, `Show on picture` opens the head's branch reading with `Against` as its state
- [ ] #3 `Show on picture` selects each listed module that the picture draws and each drawn module that holds a listed module, and draws no new mark
- [ ] #4 DESIGN.md describes `Show on picture`, and the ADR 0045 amendment is put to the user for acceptance
<!-- AC:END -->
