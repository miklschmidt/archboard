---
id: TASK-646.02
title: The branch footprint reads the working tree as its head
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T00:12:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646
type: feature
ordinal: 1088000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

An agent runs the shallow-module gate before it commits. The gate judges only the modules that the branch touched, so the branch footprint must see uncommitted changes. Otherwise the gate passes on every uncommitted change.

## Blocked by

None (can start immediately).

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: History lens `vKEsyHFk/HBlhIeSD#radK8osF` (changed: the footprint can read the working tree as its head).
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk/HBlhIeSD%23radK8osF (a worktree server serves the same address on its own port)
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

TASK-646 adds rules to `archboard check`, and this repository does not obey them yet. The CI task `check:model` fails on any warning. From the first ticket that reads more modules or adds a rule, the stack layers can fail `check:model` until TASK-646.14 clears the old findings. The stack merges as one unit, after its top layer passes.

1. Before you hand back, run `archboard check`. After TASK-646.04 is in your branch, also run `archboard check code --fail-shallow-modules --base <the branch below yours>`.
2. To find what your ticket surfaced, compare the findings with `archboard check` on the branch below yours.
3. If a finding is on a module that your ticket adds or changes, fix it in this ticket. Use the seam that the archboard skill gives for that finding. The code that this ticket writes adds no findings.
4. If a finding is on a module that your ticket does not change, leave it. TASK-646.14 clears it.
5. Never silence a finding. Add no waiver or exemption, weaken no rule or policy, and do not change `scripts/check-model.ts` or the `check:model` task to pass.
6. In your final summary, list the findings that your ticket surfaced on modules that it does not change: each code, with its count of modules. TASK-646.14 and the pull-request body account for them.
7. A ticket that adds a rule tests it on fixtures, never on this repository's code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A branch footprint with the working tree as its head names the modules that uncommitted changes touch
- [ ] #2 A branch footprint with a committed head gives the same answer as before
- [ ] #3 A History lens test covers the working-tree head
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The footprint request's head can be the working tree: a caller passes { workingTree: true } in place of a ref. A part pinned to a ref its checkout lacks keeps its ref, as it does at HEAD.
2. History lens snapshots each checkout's working tree (tracked changes and untracked, unignored files) as a commit on top of HEAD, with a copy of the index and a temporary object directory that borrows the checkout's objects. Every read of that range runs with it, and the directory is removed after. The checkout gains no object and no index change, and a clean tree reads HEAD itself.
3. The answer says workingTree: true; the rest of the range machinery is unchanged, so a committed head answers as before.
4. ADR 0045 and the Git client's notes name the exception: a footprint asked for the working tree reads uncommitted files.
5. Test first at the History lens seam (readVariantFootprint): uncommitted, staged and untracked changes name their parts, ignored files do not, the checkout is left as it was.
<!-- SECTION:PLAN:END -->
