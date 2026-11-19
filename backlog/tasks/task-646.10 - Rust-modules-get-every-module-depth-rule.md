---
id: TASK-646.10
title: Rust modules get every module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T02:37:00Z'
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
- [ ] #1 The Rust grammar queries name the kind of each export, the pieces of logic in each body, and the expression around each use
- [ ] #2 Every module-depth rule applies to Rust modules
- [ ] #3 A trait implementation used through its trait counts as used, and members that the language calls, such as `Drop`, are not judged
- [ ] #4 Each language's tests assert only what its grammar decides
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: a code-check pass over a Rust workspace fixture with a canonical vault (tests/runtime/code-check/languages/operations/rust-depth.test.ts) asserting what the Rust grammar decides: export kinds (fn, struct/enum/union as class, trait and type alias as types, const/static values, a fn-pointer const as a function, public inherent and trait-impl methods), the logic count, uses (EXPOSED_VALUE, per-name EXPOSED_UNUSED), the expression around uses (EXPOSED_VALUE_COMPUTED over Rust spellings and .min/.pow), pass-throughs, a trait impl used through its trait, and Drop/Display members left unjudged.
2. Fact analysis, Rust: rust.scm gains @logic; rust-definitions marks types, passes and members the language calls (one new optional Definition field); a new rust-math.ts names the computations around each run-time use of a path from another file.
3. Module depth: add rust to the judged adapters and RUST_FILE to JUDGED_FILES; skip members the language calls by the new field (small shared change, reported).
4. Update rust-check.test.ts for per-name EXPOSED_UNUSED. Run code-intel tests, type-check, lint, archboard check and the shallow gate; compare findings with feat/module-depth.
<!-- SECTION:PLAN:END -->
