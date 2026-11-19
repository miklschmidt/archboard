---
id: TASK-646.13
title: Terraform, Nix flakes and Helm modules get export counts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:03:00Z'
updated_date: '2026-11-19T01:22:00Z'
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
- [x] #1 Terraform, Nix flakes and Helm modules show export counts by kind
- [x] #2 Terraform keeps `VARIABLE_PASSED_THROUGH` and its own `MODULE_SHALLOW` as they are
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: a code-check pass over a fixture checkout with a bound Terraform module, a Nix flake and a Helm chart asserts depth.exports by kind and that module depth judges none of their names, while Terraform keeps its own MODULE_SHALLOW.
2. Module depth: count the exports of the infrastructure adapters (terraform, nix, helm) by the kind their adapters already name (a Nix function output is a function, every other output, variable and value a value). Count only a name at the end of its path: a flake output set or a values mapping that holds other names only groups them. Never judge them: no EXPOSED_VALUE and no module-depth MODULE_SHALLOW, so Terraform's VARIABLE_PASSED_THROUGH and MODULE_SHALLOW stay its only verdicts.
3. Fact analysis needs no change: the Terraform, Nix and Helm adapters already name each definition's kind.
4. Update comments and docs that say only TypeScript is counted; run archboard check and the gate; finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge gate (orchestrator): footprint exits 1 on code-intel (and Packages) only through the new test file infrastructure-depth.test.ts, which only code-intel binds. Exception recorded in the proposal history (operation task-646-13-exceptions). Fact analysis needed no change: the infrastructure adapters already name each definition's kind, so Module depth, the slice's endpoint, carries the change. Unbound: the archboard skill's design lens.

Evidence:
- AC1: packages/code-intel/tests/runtime/code-check/infrastructure/operations/infrastructure-depth.test.ts drives the code check pass over a fixture checkout. A bound Terraform module counts its two variables and its output as 3 values (languages [terraform]); a bound flake counts lib.greet as a function and one package per system as 2 values (languages [nix]); a bound chart counts replicas, image.repository and image.tag as 3 values (languages [helm]). A path that only groups others (packages.x86_64-linux, image) is no export.
- AC2: the same test asserts no module-depth finding names an infrastructure export, and the shallow Terraform module keeps exactly its own MODULE_SHALLOW (information) with its two pass-through variables as evidence; terraform-modules.test.ts (VARIABLE_PASSED_THROUGH and MODULE_SHALLOW) passes unchanged.
- Fact analysis needed no change: the Terraform, Nix and Helm adapters already name each definition's kind (Nix function outputs are functions). Only Module depth changed.
- Lanes: test:modules 5137 pass; type-check, lint, format:check clean.
- On this repository: archboard check gives the same findings as on feat/module-depth (EXPOSED_VALUE 245 on 25 modules, MODULE_SHALLOW information on 1, and the older codes); the vault binds no Terraform, flake or chart module, so no depth record changes. check code --fail-shallow-modules --base feat/module-depth touches Packages and Module depth's holder and promotes nothing; it exits 1 on the pre-existing warnings only.
- Footprint gate (--fail-outside) exits 1: namedAndChanged is Module depth only; changedNotNamed is code-intel and Packages, through the new test file under packages/code-intel/tests. Unbound: this task file and skills/archboard/references/design-lens.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Terraform modules, Nix flakes and Helm charts now show their exports by kind beside the other languages.

What changed:
- Module depth counts the exports of the infrastructure adapters (terraform, nix, helm) by the kind each adapter already names: a flake output that is a function is a function; every other output, variable and value is a value. Only a name at the end of its path counts, so a flake output set or a values mapping that groups other names is not an export. A flake's output given per system counts once per system, as each is a path a caller names.
- It judges none of them: no EXPOSED_VALUE and no module-depth MODULE_SHALLOW, since a caller sets a variable and reads an output or a value by design. Terraform keeps VARIABLE_PASSED_THROUGH and its own MODULE_SHALLOW unchanged.
- The archboard skill's design lens says so.

Verification: new infrastructure-depth test; test:modules 5137 pass; type-check, lint, format clean. archboard check findings are identical to the base branch.

Risks / follow-ups: TASK-646.15 also changes how Module depth counts kinds (callables made by a call); it touches countExports, which this ticket reshaped. logic stays 0 for infrastructure modules, since no infrastructure adapter counts pieces of logic.
<!-- SECTION:FINAL_SUMMARY:END -->
