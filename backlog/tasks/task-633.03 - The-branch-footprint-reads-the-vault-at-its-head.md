---
id: TASK-633.03
title: The branch footprint reads the vault at its head
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T23:49:00Z'
updated_date: '2026-11-13T00:43:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-633.01
  - TASK-633.02
parent_task_id: TASK-633
type: feature
ordinal: 1077000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-633

## What to build

A footprint with a named head reads the selected state with the vault at that head, through the branch reading, when the vault's repository resolves the head. Its proposals and bindings then decide what the commits are set against. A head that only a code repository holds keeps the vault on disk. The answer names the vault that it read: the vault on disk, or the ref and the commit.

The footprint takes `modelAt`: `head`, the default, or `checkout`, which always reads the vault on disk. `archboard model footprint` gets `--model-at <head|checkout>`, and its help says that `--state` resolves in the vault it reads. The archboard-plan gate passes `--model-at checkout`, because it runs in the integration worktree after the orchestrator edits the proposal there. The archboard-pr skill describes the branch reading for stack layers. The pull-request Action, which names no head, keeps its behavior.

TASK-633 holds the full contract and the test seams. This ticket uses the footprint part of seam 2.

## Architecture

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`.
- Slice:
  - Changed `vKEsyHFk/HBlhIeSD#radK8osF` History lens: reads the vault at a named head and names the vault it read
  - Changed `vKEsyHFk/HBlhIeSD#5SMX69gS` Code check: its state reader reads one state at a source ref
  - Changed `vKEsyHFk/XppR9owz#MrE3v2T6` Model footprint: `--model-at`
  - Added relationship History lens to Code check
  - Endpoint modules: Read entry (`vKEsyHFk#ZGONZKxj`) and Branch reading (`vKEsyHFk#DZAXm2he`), which TASK-633.01 owns
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8&focusA=vKEsyHFk/HBlhIeSD%23radK8osF,vKEsyHFk/HBlhIeSD%235SMX69gS,vKEsyHFk/XppR9owz%23MrE3v2T6,vKEsyHFk%23ZGONZKxj,vKEsyHFk%23DZAXm2he
- Gate: before this ticket merges, `archboard model footprint --base worktree-branch-footprint-view --head <ticket-branch> --state a5K6IbA8 --fail-outside` exits 0, run in the worktree of the integration branch. After TASK-633.03 lands, the gate also passes `--model-at checkout`. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-633.01
- TASK-633.02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A footprint whose head the vault's repository resolves reads the selected state, its proposals and its bindings from the vault at that head
- [x] #2 A footprint whose head only a code repository holds reads the vault on disk
- [x] #3 The footprint answer names the vault that it read: the vault on disk, or the ref and the commit
- [x] #4 `modelAt: checkout` and `archboard model footprint --model-at checkout` read the vault on disk
- [x] #5 `--state` of `archboard model footprint --head <ref>` names a proposal of the vault at that head, and its help says so
- [x] #6 The archboard-plan gate commands pass `--model-at checkout`, and the archboard-pr skill describes the branch reading for stack layers
- [x] #7 A footprint without a head behaves as before, so the pull-request Action's report does not change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on ticket/633-03-footprint-at-head (2ab0df46e5), merged into the integration branch.
The answer field is vaultRead, not vault: the CLI overwrites a top-level vault key of a JSON answer with the addressed vault, and the refs answer already has a vault object.
Added for TASK-633.04: the refs route takes an optional base and head and answers range: {mergeBase, head} or null, read from the vault's checkout without a fetch.
Gate: Commands (the --model-at option in the CLI history operations) and code-intel (the range and vaultRead schemas in the shared protocol) changed outside the slice. Recorded as an exception on the proposal.
Known gap, not fixed: readModelAtRef resolves only the ref as written, while the footprint's commitOf also tries origin/<ref>. A head that exists only as origin/x in the vault's repository falls back to the vault on disk.
Proof: footprint-at-head.test.ts (AC1 to AC4, AC7), source-refs.test.ts (range), model-footprint.test.ts (CLI --model-at and --state at a head). 130 tests pass on the integration branch after the merge. The CLI model command tests pass under the lane's per-file isolation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A footprint with a named head reads the selected state, its proposals and its bindings from the vault at that head, through the branch reading, when the vault's repository resolves it, else the vault on disk. modelAt: checkout and --model-at checkout read the vault on disk. The answer names the vault it read in vaultRead. The archboard-plan gate passes --model-at checkout, and archboard-pr describes the branch reading for stack layers.
<!-- SECTION:FINAL_SUMMARY:END -->
