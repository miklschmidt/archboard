---
id: TASK-646.12
title: Swift, C, C++ and Objective-C modules get every module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:03:00Z'
updated_date: '2026-11-19T04:17:00Z'
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
- [x] #1 The Swift, C, C++ and Objective-C grammar queries name the kind of each export, the pieces of logic in each body, and the expression around each use
- [x] #2 Every module-depth rule applies to Swift, C, C++ and Objective-C modules
- [x] #3 Members that each language calls are not judged
- [x] #4 Each language's tests assert only what its grammar decides
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: the queries c.scm (with cpp.scm for what only C++ has: range for, new, delete), objc.scm and swift.scm capture @logic; the C, C++, Objective-C and Swift definitions name each export's kind (Definition.type for a C/C++ struct, union or enum with no methods, a typedef and an alias, an Objective-C protocol, a Swift enum without methods, protocol and alias; a C function macro is a function), Definition.passes for a function or method whose one statement passes its parameters on, and the adapters give ParsedFacts.computations, the math around each use, through the shared math engine. Tests: packages/code-intel/tests/runtime/code-check/languages/operations/c-depth.test.ts, objc-depth.test.ts, swift-depth.test.ts (depth.exports, names by kind, logic, evidence lines of the repeated math, a local followed).
- AC2: the same tests: EXPOSED_VALUE (RESTART_MAX, config_retries, shop::kLimit), EXPOSED_VALUE_COMPUTED on a value and a getter (restart_base, jitter_ms, TMRestartBase, restartBase, restartMax, jitter), CODE_PASS_THROUGH on a function and a method (timing_forward, shop::Store::save, TMTimer::fire:, Timer.fire), EXPOSED_UNUSED warning after a complete read (timing_unused, unused), MODULE_SHALLOW information (Config). An #include, #import, @import or Swift import of a whole module no longer makes a read incomplete, since those languages resolve each name (module-reading.ts); c-check and swift-check now expect the per-name EXPOSED_UNUSED warning.
- AC3: C++ constructor, destructor and operators; Objective-C initializers, dealloc, description and their kin; Swift initializers, hash(into:), encode(to:), callAsFunction and makeIterator carry Definition.calledByLanguage and are neither counted nor judged (tests assert the method counts and names). A Swift call of a type (capitalised) constructs and is no pass-through.
- AC4: each language test asserts only export kinds, logic, pass-throughs and math the grammar decides; the rules stay asserted in TypeScript.
- Merge with TASK-646.11: both tickets built a shared math engine. One stays: math-grammar.ts (the reading core, which Swift drives directly) under math-shapes.ts (the declarative table that Python, Go, C# and now C, C++ and Objective-C use). Module depth keeps 646.11's static members and calledByLanguage, with this ticket's holder test (:: and a method in another file than its class) and a member test for hidden values.
- Lanes after the merge: test:modules 5180 pass, test:repository 174 pass, types, lint:all, format:check clean.
- On this repository: archboard check findings identical to feat/module-depth (1305 lines; no Swift or C-family code outside test fixtures). check code --fail-shallow-modules --base feat/module-depth: no MODULE_SHALLOW warning (Repositories, untouched, information); exit 1 from pre-existing warnings only.
- Footprint --fail-outside exits 1: namedAndChanged Code check, Module depth, Fact analysis; changedNotNamed Embedded grammars (the .scm queries and the C++ query in grammar-files.ts, which AC1 changes), code-intel (tests and test support) and its holder Packages. Code check is outside the slice: module-reading.ts opaque() gives C, C++, Objective-C and Swift whole-module imports their language's meaning (needed for an EXPOSED_UNUSED warning). Unbound: CONTEXT.md, the design lens, this task.
Merge gate (orchestrator): footprint exits 1 on modules outside the plan: Packages, code-intel, Embedded grammars. They hold the embedded grammar queries (c.scm, objc.scm, swift.scm, the new cpp.scm and grammar-files.ts) and tests. No architecture change; exception recorded in the proposal history (operation task-646-12-exceptions).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Swift, C, C++ and Objective-C modules now get every module-depth rule, judged the same way as TypeScript.

What changed:
- Queries: c.scm, objc.scm and swift.scm count pieces of logic; a new cpp.scm adds what only C++ has.
- Export kinds: a C/C++ struct, union or enum with no methods, a typedef and an alias are types, and a function macro is a function; an Objective-C protocol is a type; a Swift enum without methods, a protocol and an alias are types, and a struct is a class. An enumerator belongs to its enum.
- Members the language calls (C++ constructor, destructor, operator; Objective-C initializers, dealloc, description; Swift initializers, hash(into:), encode(to:)) are neither counted nor judged.
- Pass-throughs: a function or method whose one call or send passes its parameters on; a Swift call of a type constructs and is none.
- Math around each use: C family through the shared table, Swift through the reading core, including tree-sitter-swift's misreading of `1 + n * f()`.
- Module depth judges swift, c, cpp and objc names; a method may live in another file than its class; a member is no hidden value. Code check: a whole-module include or Swift import no longer makes a read incomplete.
- Merge with TASK-646.11: one math engine remains (math-grammar.ts core under the math-shapes.ts table).
- Docs: design lens, CONTEXT.md, code comments.

Verification: c-depth, objc-depth and swift-depth tests; test:modules 5180 pass, test:repository 174 pass, types, lint, format clean. archboard check findings identical to the base; the shallow gate promotes nothing.

Surfaced on modules this ticket does not change: none.

Risks / follow-ups: footprint --fail-outside exits 1 on Code check (whole-module imports), Embedded grammars (the queries) and code-intel (tests). Swift types are judged by convention (a capitalised callee constructs). A Swift caseless enum used as a namespace of static constants is a type, so its static values are not judged. C numbers with a suffix (1000L) keep their text in a shape.
<!-- SECTION:FINAL_SUMMARY:END -->
