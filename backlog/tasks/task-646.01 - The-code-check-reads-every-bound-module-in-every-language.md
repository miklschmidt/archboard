---
id: TASK-646.01
title: The code check reads every bound module in every language
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T00:26:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646
type: feature
ordinal: 1087000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

`archboard check code` reads the interface of every bound module, with or without parts, and every language that a module holds. Today it skips modules without parts, such as `timing`, and module exposure stops at the first language that matches. This is the prefactor that the depth rules need: they judge only what the check reads.

## Blocked by

None (can start immediately).

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Code check `vKEsyHFk/HBlhIeSD#5SMX69gS` (changed: reads every bound module in every language). Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed: module exposure reads every language that a module holds).
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk/HBlhIeSD%235SMX69gS,vKEsyHFk/6E6hL0Zk%233CaBjhIM (a worktree server serves the same address on its own port)
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
- [x] #1 `archboard check code` reports the interface of a bound module that has no parts, such as `timing`
- [x] #2 A bound module that holds two languages reports the exports of both languages
- [x] #3 A code-check fixture test covers a bound leaf module that holds two languages
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis: moduleExposure reads every language rule whose root files the module has, and merges their root files, exposed names (each rule's member rule applied to its own names) and outside files.
2. Module reading: Terraform uses read only the Terraform part of a merged exposure; code uses read the other outside files, so a module with Terraform and another language reads both.
3. Code check: judge every node bound to a module, with or without parts. Children are judged only for a node that holds parts. A node whose nearest ancestor binding the same checkout already names the same module is not judged again.
4. Tests first in interfaces.test.ts: a leaf module (no parts) gets EXPOSED_UNUSED; a leaf that holds TypeScript and Python reports unused exports of both and counts uses from both languages.
5. Run code-intel tests, lint, type-check, archboard check; compare findings with the base branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: on this repository, timing (bound to packages/timing, no parts) was skipped before. With a temporary unused export PROBE_UNUSED_MS in its root file, archboard check reported EXPOSED_UNUSED on timing: 1 of its 39 names (probe reverted). Fixture: interfaces.test.ts 'a bound module with no parts reports its interface'.
- AC2/AC3: interfaces.test.ts 'a bound module that holds two languages reports the exports and the uses of both': a leaf bound to src/kit holding index.ts and __init__.py reports tsUnused and py_unused, and counts the TypeScript and Python callers as uses. Fails on the base (Python unread).
- Decisions: a part that binds the module of a part holding it is judged with that part (no duplicate findings). The interface pass no longer pushes the code skip of an unread part: the binding claims already list it, and leaves would have duplicated it. Terraform uses read only the Terraform part of a merged exposure. Python's exposure rule moved to python/operations/python-exposure.ts, as Go's did, to keep module-exposure.ts under the 600-line limit.
- Existing tests changed: six fixture tests gain the EXPOSED_UNUSED of their directory-bound leaf parts; dropped-parts.test.ts now asserts no INHERITED_PART_DROPPED on the skipped drafts (it asserted no findings at all, and the drafts' leaf parts now get interface findings read at their refs).
- Checks: code-intel 405 pass; test:modules 5115 pass; test:system 305 pass; types, lint:all, format:check pass.
- archboard check vs feat/module-depth: base exits 0; this branch exits 1 with 5 new TEST_IMPORT_UNEXPOSED warnings on 2 modules (Canvas drawing, graphviz-pure-core) and 55 new EXPOSED_UNUSED information findings on 55 modules, none in this slice. exposure-unknown skips 84 -> 111. TASK-646.14 clears them.
- Footprint gate exits 1: 'Changed outside the draft: code-intel'. The changed test files under packages/code-intel/tests are bound only by the code-intel package node, which proposal 3nkEfr1W does not name. Needs the orchestrator to name code-intel in the proposal.

Merge gate (orchestrator): footprint exits 1 on code-intel only, because code-intel alone binds packages/code-intel/tests (the new two-language fixture test and the updated expected findings). No architectural meaning, so the exception is recorded in the proposal history (operation task-646-01-code-intel-exception). New findings on unchanged modules: TEST_IMPORT_UNEXPOSED on 2 modules (5 warnings), EXPOSED_UNUSED information on 55 modules; TASK-646.14 clears them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check now reads the interface of every part bound to a module, with or without parts, and module exposure reads every language whose root files a module has (it used to stop at the first). A part binding the same module as a part that holds it is judged once, with the holder. Fixture tests cover a leaf module and a leaf holding TypeScript and Python. The repository's own check now surfaces 5 TEST_IMPORT_UNEXPOSED warnings (2 modules) and 55 EXPOSED_UNUSED information findings (55 modules) on modules outside this slice, for TASK-646.14. The footprint gate fails on code-intel because its tests are bound only by the package node, which the proposal does not name.
<!-- SECTION:FINAL_SUMMARY:END -->
