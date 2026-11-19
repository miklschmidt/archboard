---
id: TASK-646.05
title: The other per-name rules judge TypeScript exports
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:17:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis (TypeScript): Definition.passes names the root of the one call a function or method only passes its own parameters on to (one statement or arrow body, optionally awaited; at least one argument; every argument a parameter or a spread of one; callee a name or member chain of names or this).
2. Code check (module-reading.ts): a use belongs to a module when its definition is inside it, or is a name it re-exports, through any door; each use says whether it came through this module's door. Defining sites are followed only where the reference's target file re-exports. Coverage: the outside files the read could not complete (no grammar, unparsed code, an unresolved relative import, a whole-module or dynamic import of the module). interfaces.ts hands Module depth the uses with reader and the owner of each definition, the unread files, and for each name the drawn callers whose code the pass did not read (unbound, external, other checkout).
3. Module depth, TypeScript names, one finding per name, grouped by module in export order, then MODULE_SHALLOW: EXPOSED_UNUSED (top-level names, types included; no outside use through any door for own names, through this door for re-exported ones; tests no users; warning only after a complete read with no drawn unread caller, else information; wins over a pass-through); REEXPORT_PASS_THROUGH for a non-type name defined outside the module (warning when a bound part other than this module owns the definition and a file it does not own imports the definition by another door, else information; the only depth finding on that name); CODE_PASS_THROUGH, information, on a function or public method with passes, unless the callee is rooted in a module-level value of its file; members the language calls (constructor, toString, valueOf, toJSON, toLocaleString, Symbol members) are neither counted nor judged; methods are not judged unused (their uses go through values). MODULE_SHALLOW rolls up EXPOSED_VALUE and the two pass-throughs over functions, values and public methods. The container-level EXPOSED_UNUSED stays only for names of languages Module depth does not judge yet.
4. Docs: protocol header, CLI check-help, web finding labels, archboard skill (clearing each finding; framework-called exports cleared by drawing the consumer), CONTEXT.md.
5. Tests: module-depth-names.test.ts over a fixture checkout; update interfaces.test.ts for TypeScript modules.
<!-- SECTION:PLAN:END -->
