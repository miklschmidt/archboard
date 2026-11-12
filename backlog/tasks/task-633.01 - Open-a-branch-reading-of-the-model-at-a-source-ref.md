---
id: TASK-633.01
title: Open a branch reading of the model at a source ref
status: To Do
assignee: []
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-12T23:50:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-633
type: feature
ordinal: 1075000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-633

## What to build

A branch reading reads the model as the vault holds it at a source branch or commit of the vault's repository. It reads from Git objects, as the checkpoint reader reads the history archive, and needs no checkout. The canonical read and the model routes accept a source ref beside `state` and `checkpoint`. A pane address carries the ref, so the browser opens the branch reading as a read-only reading.

The heading shows a chip with the ref and the short commit. A branch reading follows no live feed. It offers no edit, claim, publication, walkthrough recording or Explain. Comparison works. `state` and `against` resolve inside the vault that was read.

TASK-633 holds the full contract, in its Implementation Decisions, and the test seams. This ticket uses seam 1 and the branch-reading part of seam 3.

## Architecture

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`.
- Slice:
  - Added `vKEsyHFk#DZAXm2he` Branch reading
  - Changed `vKEsyHFk#ZGONZKxj` Read entry: reads a branch reading for a named source ref
  - Changed `vKEsyHFk/HBlhIeSD#nn1ec9Tw` Canonical model routes: accept a source ref
  - Changed `vKEsyHFk/yejBBUFY#w46oCRoH` Model address: carries the source ref
  - Changed `vKEsyHFk#p0EDMxTr` Reading stage: shows a branch reading as read-only
  - Added relationship Read entry to Branch reading
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8&focusA=vKEsyHFk%23DZAXm2he,vKEsyHFk%23ZGONZKxj,vKEsyHFk/HBlhIeSD%23nn1ec9Tw,vKEsyHFk/yejBBUFY%23w46oCRoH,vKEsyHFk%23p0EDMxTr
- Gate: before this ticket merges, `archboard model footprint --base worktree-branch-footprint-view --head <ticket-branch> --state a5K6IbA8 --fail-outside` exits 0, run in the worktree of the integration branch. After TASK-633.03 lands, the gate also passes `--model-at checkout`. Each module in `namedAndChanged` is in this slice.

## Blocked by

None (can start immediately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A read of the model with a source ref returns the model and proposals that the vault holds at that commit, and leaves the working tree, the index and HEAD unchanged
- [ ] #2 A ref that the vault's repository cannot resolve is refused with a code that names the ref
- [ ] #3 A request that names a source ref and a checkpoint is refused
- [ ] #4 A pane address with a source ref opens the branch reading, and the address survives a reload and browser history
- [ ] #5 A branch reading names its ref and short commit in the heading, offers no edit, claim, publication, recording or Explain, and follows no live feed
- [ ] #6 A branch reading of a proposal compares with its base, as other readings do
- [ ] #7 DESIGN.md describes the chip of a branch reading
<!-- AC:END -->
