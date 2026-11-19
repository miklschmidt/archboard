---
id: TASK-646.06
title: Math that callers repeat on an export is a finding
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:11:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.15
parent_task_id: TASK-646
type: feature
ordinal: 1092000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

Callers that compute on a module's values hold logic that belongs in the module. For example, the Codex app server computes the restart backoff from `timing` values. When two or more modules write the same math, the exporter must own it as a function.

## Blocked by

- TASK-646.05

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Module depth `vKEsyHFk#roHByn84` (changed by this ticket: `EXPOSED_VALUE_COMPUTED` and its shape matching). Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: the expression around each use, in TypeScript). Endpoint: Cached fact reader `vKEsyHFk/6E6hL0Zk#mR7wPSei`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23roHByn84,vKEsyHFk/6E6hL0Zk%233CaBjhIM,vKEsyHFk/6E6hL0Zk%23mR7wPSei (a worktree server serves the same address on its own port)
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
- [ ] #1 `EXPOSED_VALUE_COMPUTED` is a warning when two or more modules write the same math on one exported value or getter
- [ ] #2 The match ignores the callers' own names, normalizes commutative operators and follows one local variable
- [ ] #3 The match ignores equality and bitwise operators
- [ ] #4 The finding lists each caller line as evidence
- [ ] #5 The archboard skill shows the fix: the exporter owns the math as a function
<!-- AC:END -->
