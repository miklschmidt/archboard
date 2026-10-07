---
id: TASK-436.15
title: 'Code facts record whether a definition is a function, a class or a value'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:37'
updated_date: '2026-10-07 01:02'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 709000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A definition in code facts records its name, its lines and its visibility, but not its kind. So the code check cannot tell a handler that code passes to a framework, which runs, from a constant passed in the same way. That is why a use as a value never makes `RELATIONSHIP_UNDRAWN` (TASK-367.28).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each language adapter records whether each definition is a function, a class or a value
- [ ] #2 A function that code passes as an argument counts as a call for `RELATIONSHIP_UNDRAWN`, and a constant passed in the same way does not
- [ ] #3 The notes count the new warnings on the dogfood vault, and each one is drawn or explained
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add required function/class/value kind to Definition and classify each adapter from its declaration syntax; Nix output classification is coordinated with TASK-436.09.
2. Mark runtime names passed to call arguments and expose one runsDefinition helper, retaining constant and other value use behavior.
3. Use resolved definition kind to let passed functions produce RELATIONSHIP_UNDRAWN; integrate the helper with module interface judging through its owner.
4. Add focused adapter and code-check regressions, simplify and commit. No board parts or module wiring change. Parent will count each new dogfood warning and draw/explain it before finalization; keep In Progress until that and the integrated gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented mandatory Definition.kind from declaration syntax for TypeScript/TSX, Python, C/C++, Objective-C, C# and Swift, plus value kinds for infrastructure/Swift target declarations. Runtime argument syntax records passed separately from other value reads; deduplication preserves both, so an earlier function read cannot hide a later registration. Public runsDefinition joins the argument mark with known function kind; relationship evidence applies it after definition resolution. Shared realistic kind/argument regressions and imported/local callback-vs-constant relationship coverage pass. Focused code-facts and code-check owners: 197 pass, 0 fail. Touched-scope tests/product lint pass; direct tsc passes with Nix owners identical kind-only additions applied locally and excluded from this commit. Parent integrates de271100f for Nix and the module-interface helper owner, then counts/draws or explains new dogfood warnings and runs the complete gate. Simplification: syntax tables feed the existing definitions and argument rules reuse the existing chain-position mechanism. No new public module, board part or wiring. ADR 0046 records the rule and paired-header cache freshness.
<!-- SECTION:NOTES:END -->
