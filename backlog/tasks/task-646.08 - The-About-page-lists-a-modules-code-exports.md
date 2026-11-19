---
id: TASK-646.08
title: The About page lists a module's code exports
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.07
parent_task_id: TASK-646
type: feature
ordinal: 1094000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

A person reading one module wants its real interface: what the code exports, what is wrong with each export, and where it is.

## Blocked by

- TASK-646.07

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Code exports `vKEsyHFk#Y0s83yrf` (added). Right panel to Code exports `vKEsyHFk#8edJWcN6` (added). Flow step `vKEsyHFk#OAhe57tI` of `vKEsyHFk#sgbsZcAx`. Endpoint: Right panel `vKEsyHFk#iOyrvcQp`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23Y0s83yrf,vKEsyHFk%23iOyrvcQp (a worktree server serves the same address on its own port)
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
- [ ] #1 The About page lists the selected module's code exports by kind, each with its findings
- [ ] #2 Open code on an export opens its exact source, and the canonical model code browser test covers it
- [ ] #3 The model code warnings component test covers the list
<!-- AC:END -->
