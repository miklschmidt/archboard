---
id: TASK-646.10
title: Rust modules get every module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T03:02:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.06
parent_task_id: TASK-646
type: feature
ordinal: 1096000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The rules ship for TypeScript first. Rust modules must get the same verdicts, so that a module in any supported language is judged the same way.

## Blocked by

- TASK-646.06

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: the Rust grammar queries). Endpoint: Module depth `vKEsyHFk#roHByn84`.
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
- [x] #1 The Rust grammar queries name the kind of each export, the pieces of logic in each body, and the expression around each use
- [x] #2 Every module-depth rule applies to Rust modules
- [x] #3 A trait implementation used through its trait counts as used, and members that the language calls, such as `Drop`, are not judged
- [x] #4 Each language's tests assert only what its grammar decides
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: a code-check pass over a Rust crate with a canonical vault (packages/code-intel/tests/runtime/code-check/languages/operations/rust-depth.test.ts) asserting what the Rust grammar decides: export kinds, logic, uses, the math around uses, pass-throughs, trait implementations and members the language calls.
2. Fact analysis, Rust: rust.scm gains @logic; rust-definitions marks types, function pointers, associated items (static) and members of language-called trait impls (calledByLanguage, shared with TASK-646.11); rust-depth.ts holds Rust's math table and the pass-through reader.
3. The shared math reader (math-shapes.ts) learns method-style math, a math-name group, number suffixes and a use's spelling, so Rust uses it instead of a copy.
4. Module depth: rust joins the judged adapters. Code check: a whole-module import leaves a Rust read complete.
5. Update rust-check.test.ts for per-name findings; docs (CONTEXT.md, design lens, check help). Run lanes, archboard check, the shallow gate and the footprint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: packages/code-intel/tests/runtime/code-check/languages/operations/rust-depth.test.ts drives the code check over a Rust crate. Kinds: Port (trait) and Amount (type alias) are types, Kind (enum), Relay, Account (structs) classes, HANDLER (const of fn type) and post functions, Relay.RETRIES a value and Relay.new a function (associated items), Kind.is_debit, Relay.send, Account.send methods; Timing counts 1 function, 1 class, 4 values. Logic: Ledger counts 9 (calls, matches!, operators, the if, the hidden FEE), its #[cfg(test)] module aside. Uses and the expression around them: PROCESS gets EXPOSED_VALUE_COMPUTED from codex (PROCESS.restart_max.min(PROCESS.restart_base * 2u64.pow(n))) and relay (std::cmp::min through two let locals), evidence codex line 3 and relay line 5; jitter_ms() likewise (codex 6, worker 3); DEADLINE compared and masked stays EXPOSED_VALUE; LIMIT EXPOSED_VALUE; UNUSED read only by tests is an EXPOSED_UNUSED warning.
- AC2: the same test shows EXPOSED_VALUE, EXPOSED_VALUE_COMPUTED, EXPOSED_UNUSED and CODE_PASS_THROUGH (post, Relay.send) on Rust modules; rust-check.test.ts now expects per-name EXPOSED_UNUSED warnings and EXPOSED_VALUE on money::ZERO (with REEXPORT_PASS_THROUGH and MODULE_SHALLOW reached through the shared roll-up). On this repository Rust crates now get every code: see below.
- AC3: Account.send (impl Port for Account) is counted as a method with no finding; Account.drop (impl Drop, whose body only passes self on) is neither listed nor judged.
- AC4: rust-depth.test.ts asserts only grammar decisions (kinds, logic, uses, math around uses, pass-through roots, language-called members); the rules and roll-up stay asserted in the TypeScript tests.
- Lanes: test:modules 5171 pass 0 fail; code-intel 433 pass; types, lint:policy, lint:tests, format:check clean.
- archboard check on this repository against feat/module-depth's code-intel: new on Rust crates only (24 modules): EXPOSED_UNUSED warning 1373 names on 24 modules, EXPOSED_VALUE warning 174 on 7, EXPOSED_VALUE_COMPUTED warning 16 on 4, CODE_PASS_THROUGH information 41 on 13, REEXPORT_PASS_THROUGH information 66 on 4 and warning 4 on 2; the container-level EXPOSED_UNUSED information on those 24 modules is gone. No MODULE_SHALLOW on a Rust module. Nothing new on a module this ticket changes.
- check code --fail-shallow-modules --base feat/module-depth: touched Packages, Code check, code-intel, Fact analysis; no MODULE_SHALLOW on them (only Repositories, untouched, information); exit 1 on pre-existing warnings.
- Footprint --fail-outside exits 1: namedAndChanged Code check (module-reading.ts: a whole-module Rust import leaves the read complete), Module depth (rust added to the judged tables, 4 lines), Fact analysis (slice); changedNotNamed code-intel (test files) and Packages (holder). Unbound: CONTEXT.md, design lens, check help (Commands).

Footprint after the docs: changedNotNamed also Commands (check help names Rust associated items) and Agent CLI (its holder). The merge of TASK-646.11 brought calledByLanguage and static; Rust uses both in place of a field of its own.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rust modules now get every module-depth rule: their exports are counted by kind and judged one name at a time, like TypeScript, Python, Go and C#.

What changed:
- Fact analysis (Rust): rust.scm captures @logic (calls, macro calls, operators, conditions, match arms, loops, ?), counted outside #[cfg(test)]. rust-definitions marks a trait, type alias and associated type as types; a const or static of a function pointer type as a function; an associated function (no self) or constant as static, so it is an export of its own read through the type; and the members of an impl of a trait the language's syntax calls (Drop, Deref, Display and the fmt traits, operators, comparison, Iterator, Future, Fn*) as calledByLanguage. A struct, enum or union is a class with its public methods; trait-impl methods count as methods and are never judged unused.
- rust-depth.ts: Rust's math table and the pass-through reader (a body of one call that hands on parameters or self, borrowed or not; root of the path or field chain).
- The adapter names the math around each run-time path no local hides, spelled as its references spell it (timing::PROCESS is timing.PROCESS).
- Shared math reader (math-shapes.ts, small change): optional method-style math (a.min(b) is min(a, b), receiver first), a regex group naming the function (std::cmp::min and u64::pow are min and pow), a number suffix (2u64 is 2), and a use spelling hook. Other languages' shapes are unchanged.
- Module depth: rust joins the judged adapters (4 lines). Code check: a whole-module import (use crate::timing;, mod timing;) leaves a Rust read complete, since Rust reaches a module's names only by writing them.
- Docs: CONTEXT.md Export kind, design lens, check help.

Verification: new rust-depth test (kinds, logic, uses, math across .min and std::cmp::min with locals, pass-throughs, trait impl and Drop); rust-check test now expects per-name findings; test:modules 5171 pass, types, lint, format clean.

Surfaced on modules this ticket does not change (this repository's Rust crates): EXPOSED_UNUSED warning on 24 modules (1373 names, mostly crate items exported from the crate root and used only inside the crate), EXPOSED_VALUE warning on 7 (174), EXPOSED_VALUE_COMPUTED warning on 4 (16), REEXPORT_PASS_THROUGH warning on 2 (4) and information on 4 (66), CODE_PASS_THROUGH information on 13 (41). The container-level EXPOSED_UNUSED information on those 24 is gone. No MODULE_SHALLOW on a Rust module.

Risks / follow-ups: names used only inside macro_rules bodies (::x) are not seen as uses, so they can read as unused. Footprint exits 1 on Code check (whole-module imports), Commands (check help) and code-intel (tests), with their holders.
<!-- SECTION:FINAL_SUMMARY:END -->
