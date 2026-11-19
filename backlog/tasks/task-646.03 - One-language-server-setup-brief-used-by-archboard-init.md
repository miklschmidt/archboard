---
id: TASK-646.03
title: One language-server setup brief, used by archboard init
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646
type: feature
ordinal: 1089000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

`archboard init` hands the language-server setup to an agent with its own text. Fix with Codex (TASK-646.09) needs the same steps. One brief in the workspace package keeps the two from giving different steps.

## Blocked by

None (can start immediately).

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Language server setup brief `vKEsyHFk#JQ4qwewE` (added). `workspace` `vKEsyHFk/vKEsyHFk#tdKalihR` (interface: entry point Language server setup brief added). Init `vKEsyHFk/XppR9owz#XgeEM0Pb` calls the brief (relationship `vKEsyHFk#4Xftcuh4`, added).
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23JQ4qwewE,vKEsyHFk/XppR9owz%23XgeEM0Pb (a worktree server serves the same address on its own port)
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
- [ ] #1 The brief names, for each supported language, the server that it needs and how to install it
- [ ] #2 `archboard init` builds its language-server handoff from the brief, and the handoff text stays the same
- [ ] #3 The workspace package exposes the brief as an entry point
<!-- AC:END -->
