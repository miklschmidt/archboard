---
id: TASK-130
title: Replace self-running checks with typed native Bun tests
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 01:01'
updated_date: '2026-08-29 12:26'
labels: []
dependencies: []
references:
  - 'https://bun.com/docs/test'
  - 'https://bun.com/blog/bun-v1.4#bun-test'
  - 'https://bun.com/docs/typescript-6'
  - docs/agents/test-suite.md
  - docs/agents/boundaries.md
priority: high
type: chore
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Maintainers and agents currently change product behavior behind 31 self-running scripts totaling 33,810 lines. TypeScript excludes them, Oxlint gives them broad exceptions, and two files contain 7,752 and 3,549 lines. The same exceptions also cover the existing native test files.

Replace the scripts with typed Bun 1.4 tests that report named failures through bun:test, respect module boundaries, preserve real process and browser proofs, and run exactly once on every push. Split oversized tests into files a maintainer can review and Bun can schedule. Convert the eight remaining .mjs files and make that extension impossible to add again.

This parent tracks the complete migration. Child tasks are independently reviewable delivery points. TASK-086 remains the owner of the concrete canvas-process lifecycle defect and is a dependency where that behavior is reused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 31 former check scripts have native TypeScript test coverage through the same public contracts, and no scripts/check-*.mjs file remains.
- [x] #2 TypeScript checks every test and test-only support module; Oxlint applies the intended type, safety, complexity, and file-size rules without a blanket test exemption.
- [x] #3 Every test belongs to exactly one package test lane, and bun run check executes every lane once.
- [x] #4 The four browser tests remain headless and sequential, a missing agent-browser returns the documented could-not-run outcome, and no browser test runs through a parallel discovery lane.
- [x] #5 Lock and bind proofs still use separate processes; process, socket, port, environment, vault, and child cleanup are verified on success and failure.
- [x] #6 The repository contains no tracked or untracked non-ignored .mjs file, and a native repository-policy test rejects one with an actionable path list.
- [x] #7 No existing byte, JSON, PNG, stdout, stderr, exit-status, timing-diagnostic, one-write, fixed-point, or human-edit contract is weakened to complete the migration.
- [x] #8 bun run check passes from a clean checkout, and docs/agents/test-suite.md describes the resulting native test lanes and their constraints.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Deliver the migration through TASK-130.01 through TASK-130.11 in dependency order. Each child owns a reviewable conversion slice, preserves its predecessor observables through native typed tests, passes independent review and focused validation, and lands before the final atomic lane and no-MJS cutover. Finalize the parent only after every child is Done, the real inventory reaches each native test exactly once, the repository contains no non-ignored MJS file, and the complete check evidence is recorded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Execution started after the preceding backlog batch completed. Work will follow the recorded dependency graph: TASK-130.01 first; independent migration waves after its enforcement foundation; TASK-130.05 after geometry migration; TASK-130.10 after board/state/process migrations; TASK-130.11 last. TASK-129 remains separate from the migration and follows the native board-inspection coverage so product behavior is not mixed into a test-framework conversion.

Parent finalization audit: TASK-130.01 through TASK-130.11 are Done with every child acceptance criterion checked and a non-null final summary. On integrated main, bun run test:repository passed 61 tests and 218 expectations, including exact once-only lane inventory, missing-prerequisite browser outcomes, type/lint boundary enforcement, and the real-checkout no-MJS policy. git ls-files --cached --others --exclude-standard '*.mjs' returned no path; git diff --check passed. Child evidence records clean browser-inclusive bun run check coverage and preserved predecessor contracts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the 31 self-running checks with typed native Bun module, system, repository, and serial-browser owners through eleven independently reviewed subtasks. The integrated result has exactly-once inventory, typed and linted test support, headless sequential browser execution, verified process cleanup, no non-ignored MJS files, preserved predecessor contracts, and clean complete-check evidence. Parent verification passed bun run test:repository (61 tests, 218 expectations), the real no-MJS audit, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
