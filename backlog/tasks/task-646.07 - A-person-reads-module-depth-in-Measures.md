---
id: TASK-646.07
title: A person reads module depth in Measures
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.04
parent_task_id: TASK-646
type: feature
ordinal: 1093000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The browser tracer bullet. A person sees the code's own interface beside the model's, and the code findings beside the model findings, from the last code pass.

## Blocked by

- TASK-646.04

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Flow `vKEsyHFk#sgbsZcAx` "A person reads module depth in Measures", steps `vKEsyHFk#ThS1TrIe`, `vKEsyHFk#nv6IUIIo`, `vKEsyHFk#Mw2ObWB8`, `vKEsyHFk#ap5B41FS`, `vKEsyHFk#CkmWAi8p` and the decision `vKEsyHFk#eLM3oKam` (its missing-server branch belongs to TASK-646.09). Measures `vKEsyHFk#tQ2B3iEF` (changed: Model and Code columns, code findings). Code findings memory `vKEsyHFk/HBlhIeSD#yYQ3AHkf` (changed). Measures to Fetch semantic reads `vKEsyHFk#HeTg2hKV` (added). Interfaces: `Retained reads` `vKEsyHFk/UOXNWLhR#kr46TVLf` and `Picture clients` `vKEsyHFk/yejBBUFY#dtYjWvlf` gain the caller Measures. Endpoints: Fetch semantic reads `vKEsyHFk/UOXNWLhR#tmwUm8BL`, Code check route `vKEsyHFk/HBlhIeSD#3bPZg9a5`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&grammarA=sequence&flowA=vKEsyHFk%23sgbsZcAx (a worktree server serves the same address on its own port)
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
- [ ] #1 `What a module exposes` shows grouped Model and Code columns side by side, each sortable
- [ ] #2 Code findings join the findings list
- [ ] #3 A module with no findings shows as clean, and an incomplete read names what it skipped
- [ ] #4 Code findings memory keeps each module's exports, counts, findings, language coverage and skipped reads per model, state and revision, modules with no findings included
- [ ] #5 Opening a pane never starts a code pass
- [ ] #6 The model code evidence and model measures component tests cover the columns and the findings
<!-- AC:END -->
