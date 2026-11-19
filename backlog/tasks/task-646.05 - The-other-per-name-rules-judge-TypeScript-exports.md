---
id: TASK-646.05
title: The other per-name rules judge TypeScript exports
status: To Do
assignee: []
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:38:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.04
parent_task_id: TASK-646
type: feature
ordinal: 1091000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

With the gate in place, the remaining per-name rules complete the verdicts: pass-throughs, two doors to one name, and unused exports that only a complete read can prove.

## Blocked by

- TASK-646.04

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Module depth `vKEsyHFk#roHByn84` (changed by this ticket: the pass-through, re-export and unused-export rules, class methods as exports, grouping). Endpoint: Code check `vKEsyHFk/HBlhIeSD#5SMX69gS`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23roHByn84,vKEsyHFk/HBlhIeSD%235SMX69gS (a worktree server serves the same address on its own port)
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
- [ ] #1 `CODE_PASS_THROUGH` and a single re-export are information
- [ ] #2 `REEXPORT_PASS_THROUGH` is a warning only when outside callers also import the defining module directly
- [ ] #3 `EXPOSED_UNUSED` is a warning only when the reader resolved every use in that language and the model draws no outside caller of the export; otherwise it is information, and the `private` package rule is gone
- [ ] #4 Tests do not count as users, an implementation used through its interface counts as used, and members that the language calls are not judged
- [ ] #5 Each public method of an exported class counts as its own export
- [ ] #6 The check gives one finding per name, grouped by module
- [ ] #7 The archboard skill shows how to clear each of these findings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge gate (orchestrator): footprint exits 1 on Commands (the check help text lists the new codes) and code-intel (the code-check protocol header comment and tests), with their holders. No architecture change, so the exception is recorded in the proposal history (operation task-646-05-exceptions). Fact analysis changed inside the plan. Unbound: CONTEXT.md, ADR 0082 and the archboard skill. New findings on unchanged modules: EXPOSED_UNUSED warning on 44 modules (813 names), information on 28; CODE_PASS_THROUGH information on 5; REEXPORT_PASS_THROUGH warning on codex-realtime-voice; EXPOSED_VALUE on Pane rules. TASK-646.14 clears them.
<!-- SECTION:NOTES:END -->
