---
id: TASK-130
title: Replace self-running checks with typed native Bun tests
status: To Do
assignee: []
created_date: '2026-08-28 01:01'
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
- [ ] #1 All 31 former check scripts have native TypeScript test coverage through the same public contracts, and no scripts/check-*.mjs file remains.
- [ ] #2 TypeScript checks every test and test-only support module; Oxlint applies the intended type, safety, complexity, and file-size rules without a blanket test exemption.
- [ ] #3 Every test belongs to exactly one package test lane, and bun run check executes every lane once.
- [ ] #4 The four browser tests remain headless and sequential, a missing agent-browser returns the documented could-not-run outcome, and no browser test runs through a parallel discovery lane.
- [ ] #5 Lock and bind proofs still use separate processes; process, socket, port, environment, vault, and child cleanup are verified on success and failure.
- [ ] #6 The repository contains no tracked or untracked non-ignored .mjs file, and a native repository-policy test rejects one with an actionable path list.
- [ ] #7 No existing byte, JSON, PNG, stdout, stderr, exit-status, timing-diagnostic, one-write, fixed-point, or human-edit contract is weakened to complete the migration.
- [ ] #8 bun run check passes from a clean checkout, and docs/agents/test-suite.md describes the resulting native test lanes and their constraints.
<!-- AC:END -->
