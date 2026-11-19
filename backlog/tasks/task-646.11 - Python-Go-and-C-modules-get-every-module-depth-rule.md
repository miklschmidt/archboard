---
id: TASK-646.11
title: Python, Go and C# modules get every module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:03:00Z'
updated_date: '2026-11-19T02:29:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.06
parent_task_id: TASK-646
type: feature
ordinal: 1097000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The rules ship for TypeScript first. Python, Go and C# modules must get the same verdicts, so that a module in any supported language is judged the same way.

## Blocked by

- TASK-646.06

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: the Python, Go and C# grammar queries). Endpoint: Module depth `vKEsyHFk#roHByn84`.
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
- [ ] #1 The Python, Go and C# grammar queries name the kind of each export, the pieces of logic in each body, and the expression around each use
- [ ] #2 Every module-depth rule applies to Python, Go and C# modules
- [ ] #3 Members that each language calls are not judged
- [ ] #4 Each language's tests assert only what its grammar decides
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis: Definition gains calledByLanguage (each adapter marks the members its language calls; TypeScript moves its five names out of Module depth) and static (C# static and const members).
2. A language-neutral math-shape engine (code-facts/operations/math-shapes.ts) driven by a per-language syntax table; Python, Go and C# give ParsedFacts.computations through it. TypeScript keeps typescript-math.ts (migration is a follow-up).
3. Python: @logic captures, Definition.type (type alias statements, X: TypeAlias), Definition.passes, computations around uses of imported names; dunders called by the language.
4. Go: @logic, Definition.type (interfaces, aliases, named non-struct types without methods in their file; struct and named types with methods are classes), passes, computations around package-qualified uses; String/Error/GoString/Format called by the language.
5. C#: @logic, Definition.type (interface, enum, delegate), static members (static/const fields, static properties, a property with a body is a getter function), passes, computations around run-time chains; constructors, finalizers and override ToString/Equals/GetHashCode called by the language.
6. Module depth (small, shared): python, go and csharp judged; a static member of an exported class counts as a top-level export of its kind, and is never judged EXPOSED_UNUSED; members marked calledByLanguage are neither counted nor judged.
7. Tests: one fixture test per language under code-check/languages asserting export kinds, logic, uses, passes and the math around uses.
8. archboard check, gate run, footprint, finalization.
<!-- SECTION:PLAN:END -->
