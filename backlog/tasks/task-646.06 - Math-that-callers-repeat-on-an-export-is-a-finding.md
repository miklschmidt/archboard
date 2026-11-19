---
id: TASK-646.06
title: Math that callers repeat on an export is a finding
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T02:21:00Z'
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
- [x] #1 `EXPOSED_VALUE_COMPUTED` is a warning when two or more modules write the same math on one exported value or getter
- [x] #2 The match ignores the callers' own names, normalizes commutative operators and follows one local variable
- [x] #3 The match ignores equality and bitwise operators
- [x] #4 The finding lists each caller line as evidence
- [x] #5 The archboard skill shows the fix: the exporter owns the math as a function
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis (TypeScript): a new typescript-math.ts gives ParsedFacts.computations: for each run-time use of an imported name inside arithmetic (+ - * / % **, unary sign, parentheses, Math functions), the math's shape with the use as @, numbers by value and every other operand as an ellipsis; + * Math.min Math.max sorted; equality, comparison, bitwise, logical operators and string + end the math; a use read whole into one local (const x = X.a, const { a } = X) is followed once. The Cached fact reader passes computations into SyntaxFacts.
2. Module depth: computed-math.ts groups the computations in the files that read an exported value or getter (a function called with no arguments) by shape, with the use's own spelling replaced by the export; a shape that two or more reader modules write gives EXPOSED_VALUE_COMPUTED (warning, export named, evidence on every caller line). It replaces EXPOSED_VALUE on that value (one finding per name) and rolls up into MODULE_SHALLOW.
3. Test first: module-depth-computed.test.ts drives createCodeCheck().run over a fixture checkout (commutative order, caller names, one local, Math.min order, equality/bitwise ignored, a getter, one reader, different math).
4. Docs: archboard skill design lens (the fix: exporter owns the math as a function), CONTEXT.md, ADR 0082, protocol header, check help.
5. Run archboard check and the shallow gate; list EXPOSED_VALUE_COMPUTED matches on this repository.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1-AC3: packages/code-intel/tests/runtime/code-check/operations/module-depth-computed.test.ts drives createCodeCheck().run over a fixture checkout. Codex and Relay write the restart backoff on PROCESS_MS with their own names, swapped operand order and swapped Math.min arguments, Relay through const base = PROCESS_MS.restartBase and const { restartMax } = PROCESS_MS: EXPOSED_VALUE_COMPUTED, warning. Codex and Worker compute on the getter jitterMs() in another order: EXPOSED_VALUE_COMPUTED. DEADLINE_MS compared (===, !==) and masked (&, |) in two modules, and STEP_MS with different math (* 2, + 2), stay EXPOSED_VALUE; LIMIT with one reader stays EXPOSED_VALUE.
- AC4: same file: the evidence is every caller line, with the reading part (Codex line 3, Relay line 5; Codex line 6, Worker line 6).
- AC5: skills/archboard/references/design-lens.md (EXPOSED_VALUE_COMPUTED) shows restartDelayMs(attempt) on the exporter; CONTEXT.md (Repeated math), ADR 0082, check help, protocol header.
- Lanes: test:modules 5153 pass, test:repository 174 pass, types, lint:all, format:check clean.
- On this repository: archboard check gives 8 EXPOSED_VALUE_COMPUTED (timing 6, renderer 1, walkthrough 1); EXPOSED_VALUE falls from 230 to 222, every other count is unchanged. check code --fail-shallow-modules --base feat/module-depth: no MODULE_SHALLOW on a touched module (Repositories, untouched, information); exit 1 from the pre-existing warnings only.
- Footprint --fail-outside exits 1: namedAndChanged Module depth, Fact analysis, Cached fact reader (all in the slice); changedNotNamed Commands (check help lists the new code) and code-intel (protocol header comment, the new test), with holders Packages and Agent CLI. Unbound: CONTEXT.md, ADR 0082, the design lens.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Math that two or more modules write on one exported value or getter is now EXPOSED_VALUE_COMPUTED, a warning on that export with every caller line as evidence.
What changed:
- Fact analysis (TypeScript, typescript-math.ts): each file names the math around every run-time use of a name it imports (ParsedFacts.computations): the largest expression of + - * / % **, unary signs, parentheses and Math functions; the use is @, a number is its value, every other operand is an ellipsis; + * Math.min Math.max Math.hypot operands sorted; equality, comparison, bitwise, logical operators and string + end the math; a use held whole by one local (const x = X.a, const { a } = X) is followed once; a zero-argument call is a getter's read. The Cached fact reader carries computations into SyntaxFacts.
- Module depth (computed-math.ts): for an exported value or function, replaces each file's own spelling with the export's name and groups by shape; a shape that two or more reading modules write gives EXPOSED_VALUE_COMPUTED in place of EXPOSED_VALUE (or CODE_PASS_THROUGH for a getter), one finding per name; it rolls up into MODULE_SHALLOW. Methods are not judged.
- Docs: archboard skill design lens (the exporter owns the math as a function), CONTEXT.md, ADR 0082, protocol header, check help.
Verification: new module-depth-computed test; test:modules 5153 pass, test:repository 174 pass, types, lint, format clean.
Surfaced on modules this ticket does not change: EXPOSED_VALUE_COMPUTED on 3 modules (timing 6 names, renderer 1, walkthrough 1); each replaces an EXPOSED_VALUE that was already there, so the warning total is unchanged.
Risks / follow-ups: matches are by shape, so unrelated math of one form matches (the accepted deadline/jitter case; on this repository the matches of the form X.field + … are of that kind). The web chip has no label for the new code and reads it as words (Exposed value computed). Footprint exits 1 on Commands and code-intel as listed in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->
