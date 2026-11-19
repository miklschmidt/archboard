---
id: TASK-646.05
title: The other per-name rules judge TypeScript exports
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:39:00Z'
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
- [x] #1 `CODE_PASS_THROUGH` and a single re-export are information
- [x] #2 `REEXPORT_PASS_THROUGH` is a warning only when outside callers also import the defining module directly
- [x] #3 `EXPOSED_UNUSED` is a warning only when the reader resolved every use in that language and the model draws no outside caller of the export; otherwise it is information, and the `private` package rule is gone
- [x] #4 Tests do not count as users, an implementation used through its interface counts as used, and members that the language calls are not judged
- [x] #5 Each public method of an exported class counts as its own export
- [x] #6 The check gives one finding per name, grouped by module
- [x] #7 The archboard skill shows how to clear each of these findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis (TypeScript): Definition.passes names the root of the one call a function or method only passes its own parameters on to (one statement or arrow body, optionally awaited; at least one argument; every argument a parameter or a spread of one; callee a name or member chain of names or this).
2. Code check (module-reading.ts): a use belongs to a module when its definition is inside it, or is a name it re-exports, through any door; each use says whether it came through this module's door. Defining sites are followed only where the reference's target file re-exports. Coverage: the outside files the read could not complete (no grammar, unparsed code, an unresolved relative import, a whole-module or dynamic import of the module). interfaces.ts hands Module depth the uses with reader and the owner of each definition, the unread files, and for each name the drawn callers whose code the pass did not read (unbound, external, other checkout).
3. Module depth, TypeScript names, one finding per name, grouped by module in export order, then MODULE_SHALLOW: EXPOSED_UNUSED (top-level names, types included; no outside use through any door for own names, through this door for re-exported ones; tests no users; warning only after a complete read with no drawn unread caller, else information; wins over a pass-through); REEXPORT_PASS_THROUGH for a non-type name defined outside the module (warning when a bound part other than this module owns the definition and a file it does not own imports the definition by another door, else information; the only depth finding on that name); CODE_PASS_THROUGH, information, on a function or public method with passes, unless the callee is rooted in a module-level value of its file; members the language calls (constructor, toString, valueOf, toJSON, toLocaleString, Symbol members) are neither counted nor judged; methods are not judged unused (their uses go through values). MODULE_SHALLOW rolls up EXPOSED_VALUE and the two pass-throughs over functions, values and public methods. The container-level EXPOSED_UNUSED stays only for names of languages Module depth does not judge yet.
4. Docs: protocol header, CLI check-help, web finding labels, archboard skill (clearing each finding; framework-called exports cleared by drawing the consumer), CONTEXT.md.
5. Tests: module-depth-names.test.ts over a fixture checkout; update interfaces.test.ts for TypeScript modules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1, AC4, AC5: packages/code-intel/tests/runtime/code-check/operations/module-depth-names.test.ts drives createCodeCheck().run over a canonical vault in a Git fixture: CODE_PASS_THROUGH information on a function and on a public method (Relay.send); toJSON and the constructor are not judged; MODULE_SHALLOW over functions and public methods.
- AC2: same file: REEXPORT_PASS_THROUGH information through one door (format), warning with the other door's files as evidence when the worker and relay import the defining module directly (save).
- AC3, AC4: same file: EXPOSED_UNUSED warning for an unused function, a test-only one and an unused type after a complete read; information for a name whose consumer the model draws without readable code (Sdk); information when outside code that did not parse names an export; a use through another module's re-export is a use; HttpPort.send used only through Port.send gets nothing. No package.json private rule exists; ADR 0082 records that drawing the consumer replaces it.
- AC6: same file: one finding per name, each module's depth findings contiguous, in export order, then MODULE_SHALLOW. interfaces.test.ts, code-facts-judging.test.ts, nix-build-check.test.ts now expect per-name EXPOSED_UNUSED for TypeScript names.
- AC7: skills/archboard/references/design-lens.md (Module depth) shows the seam for CODE_PASS_THROUGH, REEXPORT_PASS_THROUGH, EXPOSED_UNUSED; CONTEXT.md terms; CLI check help; ADR 0082 amended.
- Refinement after the first repository run: code that did not parse makes a read incomplete only where it names a name the module exposes (two files here hold TS the grammar cannot parse, which made every read incomplete).
- Lanes: test:modules 5142 pass, test:repository 174 pass, type-check, lint:tests, lint:policy, format:check clean. Code facts on this repository: about 20 s before and after.
- archboard check code --fail-shallow-modules --base feat/module-depth: touched modules carry no MODULE_SHALLOW; only Repositories (untouched) is shallow, information. Footprint --fail-outside exits 1: Commands (check help text) and code-intel (protocol header, tests) changed outside the draft; Fact analysis is named in the proposal but outside this ticket's slice.
Merge gate (orchestrator): footprint exits 1 on Commands (the check help text lists the new codes) and code-intel (the code-check protocol header comment and tests), with their holders. No architecture change, so the exception is recorded in the proposal history (operation task-646-05-exceptions). Fact analysis changed inside the plan. Unbound: CONTEXT.md, ADR 0082 and the archboard skill. New findings on unchanged modules: EXPOSED_UNUSED warning on 44 modules (813 names), information on 28; CODE_PASS_THROUGH information on 5; REEXPORT_PASS_THROUGH warning on codex-realtime-voice; EXPOSED_VALUE on Pane rules. TASK-646.14 clears them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Module depth now gives each exported TypeScript name at most one finding, grouped by module.

What changed:
- Fact analysis (TypeScript): a function or method whose body only passes its own parameters to one call carries Definition.passes, the callee's root.
- Code check: a module's uses include those through another module's re-export (each marked by door), and of names it passes on from elsewhere. It names the outside files it could not read whole (no grammar, unparsed code that names an export, unresolved relative import, whole-module import) and, per name, the callers the model draws whose code the pass does not read. The Module depth hand-off moved to judged-module.ts for the line limit.
- Module depth (split into depth-reading.ts, name-findings.ts): EXPOSED_UNUSED per top-level name (warning only after a complete read with no unseen drawn caller; tests are no users), REEXPORT_PASS_THROUGH (warning for two doors when a bound part owns the definition, else information; types skipped), EXPOSED_VALUE, CODE_PASS_THROUGH (information; not when the callee is a module-level value of its file, nor for zero-argument calls). Public methods are judged; constructor, toString, valueOf, toJSON, toLocaleString are not counted or judged; methods are never judged unused. MODULE_SHALLOW rolls up EXPOSED_VALUE and the pass-throughs; a class stands for its methods. Names of other languages keep the container-level EXPOSED_UNUSED until their tickets.
- Docs: ADR 0082, CONTEXT.md, archboard skill design lens, CLI check help, protocol header.

Surfaced on this repository, on modules this ticket does not change: EXPOSED_UNUSED warning on 44 modules (813 names; mostly exports used only by sibling files of a directory-bound module), EXPOSED_UNUSED information on 28 modules, CODE_PASS_THROUGH information on 5 modules (7 names), REEXPORT_PASS_THROUGH warning on 1 module (codex-realtime-voice resolveCodexExecutable), EXPOSED_VALUE warning on 1 more module (Pane rules MAX_PANES, now that reads through a re-export count).

Risks / follow-ups: JavaScript, Vue or Svelte files outside a module are not read, so they cannot keep an export used. The code-intel module itself carries pre-existing EXPOSED_VALUE warnings on its zod schemas (TASK-646.15 / 646.14).
<!-- SECTION:FINAL_SUMMARY:END -->
