---
id: TASK-646.02
title: The branch footprint reads the working tree as its head
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T00:19:00Z'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge gate (orchestrator): footprint exits 1 on code-intel only, because code-intel alone binds the History lens test under packages/code-intel/tests and the shared footprint protocol that gains the workingTree field. Neither has architectural meaning beyond the planned History lens change, so the exception is recorded in the proposal history (operation task-646-02-code-intel-exception). Unbound files: this task file and ADR 0045, which no module binds.
<!-- SECTION:NOTES:END -->
