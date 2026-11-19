---
id: TASK-646.13
title: Terraform, Nix flakes and Helm modules get export counts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:03:00Z'
updated_date: '2026-11-19T01:12:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.04
parent_task_id: TASK-646
type: feature
ordinal: 1099000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

Infrastructure modules show their interface by kind beside the other languages. Terraform already has its own pass-through rules, and they stay.

## Blocked by

- TASK-646.04

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: export kinds for Terraform, Nix flakes and Helm). Endpoint: Module depth `vKEsyHFk#roHByn84`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk/6E6hL0Zk%233CaBjhIM,vKEsyHFk%23roHByn84 (a worktree server serves the same address on its own port)
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
- [ ] #1 Terraform, Nix flakes and Helm modules show export counts by kind
- [ ] #2 Terraform keeps `VARIABLE_PASSED_THROUGH` and its own `MODULE_SHALLOW` as they are
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: a code-check pass over a fixture checkout with a bound Terraform module, a Nix flake and a Helm chart asserts depth.exports by kind and that module depth judges none of their names, while Terraform keeps its own MODULE_SHALLOW.
2. Module depth: count the exports of the infrastructure adapters (terraform, nix, helm) by the kind their adapters already name (a Nix function output is a function, every other output, variable and value a value). Count only a name at the end of its path: a flake output set or a values mapping that holds other names only groups them. Never judge them: no EXPOSED_VALUE and no module-depth MODULE_SHALLOW, so Terraform's VARIABLE_PASSED_THROUGH and MODULE_SHALLOW stay its only verdicts.
3. Fact analysis needs no change: the Terraform, Nix and Helm adapters already name each definition's kind.
4. Update comments and docs that say only TypeScript is counted; run archboard check and the gate; finalize.
<!-- SECTION:PLAN:END -->
