---
id: TASK-581
title: 'A Rust file that a #[cfg(test)] mod declares is test code for the code check'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T11:29:00Z'
updated_date: '2026-11-06T11:56:00Z'
labels:
  - code-intel
  - bug
dependencies: []
ordinal: 1023000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check reports RELATIONSHIP_UNDRAWN 'The code of Painter core reaches Page painter'. The only uses are test code: crates/archboard-paint/src/between/interrupted.rs, declared as '#[cfg(test)] mod interrupted;' in between/mod.rs:30, imports archboard_scene::paint::design::RAIL_GAP. The Rust adapter (packages/code-intel/src/runtime/operations/code-facts/rust/rust-adapter.ts, testItems) skips #[cfg(test)] items inside one file, but a file whose out-of-line module declaration carries #[cfg(test)] still counts as production code, so its imports become production dependencies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Imports and calls in a Rust file whose module declaration is under #[cfg(test)], and in every file below that module, are not production dependencies
- [x] #2 A focused code-intel test owns the behavior with a parent file that declares a #[cfg(test)] out-of-line module
- [x] #3 archboard check on main reports no RELATIONSHIP_UNDRAWN warning for Painter core -> Page painter
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: rust-test-modules.test.ts (fixture: lib.rs declares #[cfg(test)] mod helper; helper.rs declares mod deep; both import a production module).
2. Rust adapter records the out-of-line modules declared under #[cfg(test)] as ParsedFacts.testModules.
3. Rust resolver (inModule) finds the declaration of a file's module and of each module above it; a hit marks the file test (ModuleReading.test), and reader.resolved drops its imports and uses, as #![cfg(test)] does inside one file.
4. Run code-intel tests, types, lint; archboard check before/after.

Review repair: record all out-of-line Rust module declarations, follow actual declarations across ancestor files and colocated crate roots, and keep imports when any declaration reaches production code. Cover shared files, inline modules, undeclared files, crate roots, and reuse of the parse cache in the focused code-intel owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: rust-adapter.ts testItems (line ~387) skips #[cfg(test)] items only inside one file; the Rust facts of a file are per file, so helper files that a parent's '#[cfg(test)] mod x;' declares (between/interrupted.rs) kept their imports and calls as production facts. Fix: rustFacts records the out-of-line modules declared under #[cfg(test)] as ParsedFacts.testModules; the Rust resolver inModule (rust-resolution.ts isTestModule, rust-crates.ts declarationsOf) finds the declaration of the file's module and of every module above it in the declaring files, and returns ModuleReading.test; reader.ts resolved() then drops that file's imports and uses (definitions stay), as #![cfg(test)] does inside a file. Test: packages/code-intel/tests/runtime/operations/code-facts/rust/rust-test-modules.test.ts. Evidence: bun test in packages/code-intel 369 pass 0 fail; types, lint, format pass. archboard check against the main checkout's vault (the worktree's vault has no Painter core module, it is uncommitted in main) with this worktree's code: before 1 warning + 184 information, after 0 warning + 184 information; the only difference is the Painter core -> Page painter RELATIONSHIP_UNDRAWN warning. Decision: the task file was untracked in the main checkout, so I copied it into this worktree to use the backlog CLI.

Review scope stays inside the existing code-intel facts adapter and resolver. Package ownership and public contracts stay accurate, so no architecture proposal or consumer guidance change is needed.

Review fixes R1 and S1: the declaration walk now reads actual module declarations across inline paths and colocated crate roots. It preserves shared production modules, duplicate production declarations, and undeclared files. Module facts use a map instead of repeated linear searches, and each pass memoizes classification. The focused owner covers mod.rs and name.rs, inline declarations, two ancestors, crate roots, orphan files, parent edits, and shared parse reuse. Code-intel tests: 370 pass, 2 optional language-server skips, 0 fail. Types and focused source/test lint pass.
<!-- SECTION:NOTES:END -->
