---
id: TASK-646.12
title: Swift, C, C++ and Objective-C modules get every module-depth rule
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
ordinal: 1098000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The rules ship for TypeScript first. Swift, C, C++ and Objective-C modules must get the same verdicts, so that a module in any supported language is judged the same way.

## Blocked by

- TASK-646.06

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: the Swift, C, C++ and Objective-C grammar queries). Endpoint: Module depth `vKEsyHFk#roHByn84`.
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
- [ ] #1 The Swift, C, C++ and Objective-C grammar queries name the kind of each export, the pieces of logic in each body, and the expression around each use
- [ ] #2 Every module-depth rule applies to Swift, C, C++ and Objective-C modules
- [ ] #3 Members that each language calls are not judged
- [ ] #4 Each language's tests assert only what its grammar decides
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: one code-check pass test per language family over a fixture checkout (C and C++, Objective-C, Swift), asserting only what each grammar decides: export kinds (depth.exports), pieces of logic, pass-throughs and the math around uses, and through them that every module-depth rule fires; members the language calls are neither counted nor judged.
2. Fact analysis, queries: @logic captures in c.scm (nodes both C grammars have) plus what only C++ has, objc.scm (the C captures and message sends), swift.scm.
3. Fact analysis, C family: Definition.type for a struct, union or enum without methods, a typedef and a using alias, an Objective-C protocol; a function-like macro is a function; a mark for members the language calls (C++ constructor, destructor, operator; Objective-C init family, dealloc, description); Definition.passes for a function or method whose one statement passes its parameters on; computations through a shared math-shape engine driven by a small syntax table per grammar family.
4. Fact analysis, Swift: the same for Swift (types: enum/struct/class without methods, protocol, typealias; init, hash(into:), encode(to:) called by the language; passes; computations through navigation expressions).
5. Exposure: the C rule makes an enumerator a member of its enum. Module depth (shared, small): judge swift, c, cpp, objc names; a holder through :: as well as .; skip members the language calls. Code check (shared, small): an include or a Swift import of a whole module does not make a read incomplete, since those languages resolve each name.
6. Docs: module-depth header, ADR 0082 and CONTEXT where they say TypeScript only, archboard skill design lens.
7. Run archboard check and the shallow gate; finalize.
<!-- SECTION:PLAN:END -->
