---
id: TASK-646.14
title: archboard check passes on this repository again
status: To Do
assignee: []
created_date: '2026-11-19T00:03:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.04
  - TASK-646.05
  - TASK-646.06
  - TASK-646.10
  - TASK-646.11
  - TASK-646.12
  - TASK-646.13
parent_task_id: TASK-646
type: feature
ordinal: 1100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This ticket is the explicit refactoring pull request: the top layer of the TASK-646 stack, made with `gh stack`. It clears every finding that the rules raise on code that the other tickets did not change, so the whole stack merges green. The final summaries of the other tickets list the findings that each surfaced. If the findings do not fit one focused context, split this ticket into subtasks per package before you start.

## Blocked by

- TASK-646.04
- TASK-646.05
- TASK-646.06
- TASK-646.10
- TASK-646.11
- TASK-646.12
- TASK-646.13

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: The modules that the findings name. A refactor that changes a relationship, such as a caller that stops reading a module's values, goes into proposal `3nkEfr1W` through the orchestrator. A change without architectural meaning is a recorded exception under the archboard-plan deviation rules.
- Link: none, because the slice is the modules that the findings name.
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
- [ ] #1 `archboard check` and the CI task `check:model` pass at the top of the stack
- [ ] #2 No rule, waiver, exemption, policy or check script is weakened to pass
- [ ] #3 Each finding is cleared with the seam that the archboard skill names, for example `timing` exposes functions that hide the timing logic, and callers stop importing its constants
- [ ] #4 The vault policy of this repository turns the shallow-module gate on
- [ ] #5 The pull request is the top layer of the TASK-646 stack
<!-- AC:END -->
