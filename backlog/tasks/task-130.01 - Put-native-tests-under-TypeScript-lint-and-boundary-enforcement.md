---
id: TASK-130.01
title: 'Put native tests under TypeScript, lint, and boundary enforcement'
status: To Do
assignee: []
created_date: '2026-08-28 01:02'
labels: []
dependencies: []
references:
  - tsconfig.json
  - .oxlintrc.jsonc
  - tools/oxlint-plugin-archboard.js
  - docs/agents/boundaries.md
  - src/cli/command-contract/tests/command-contract.test.ts
  - 'https://bun.com/docs/typescript-6'
parent_task_id: TASK-130
priority: high
type: chore
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Existing bun:test files look typed but tsconfig.json excludes them, TypeScript 7 has no Bun declaration package configured, and the Oxlint override disables core rules for every test file. Establish one honest test boundary before migrating the legacy checks.

The resulting structure must support co-located module contract tests and one explicit home for cross-module black-box tests. It must not invent source modules for repository or full-product checks, and it must prevent product code from importing test code. Keep the temporary scripts/**/*.mjs lint exception only until the final cutover task removes the last file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pinned Bun type declaration dependency and a strict no-emit test/tools TypeScript configuration cover every existing native test and test-only support file through bun run type-check.
- [ ] #2 The boundary documentation and custom Oxlint rule define and enforce co-located module tests plus one explicit system-test location; system tests import product modules only through root entrypoints, and product code cannot import test code or fixtures.
- [ ] #3 The blanket *.test.ts and *.spec.ts lint exemption is removed. Any remaining test-specific rule exception is path-scoped, documented, and proven necessary by reachable behavior.
- [ ] #4 Oxlint enforces a 500-line maximum for test source files. Authored large fixtures live in named fixture files rather than bypass comments.
- [ ] #5 The existing 965-line command-contract native test is split by contract so all pre-existing native tests satisfy the new type, lint, boundary, and file-size gates.
- [ ] #6 Focused negative tests prove test type-check coverage, forbidden deep imports, product-to-test imports, invalid test placement, and oversized test files fail with actionable diagnostics.
- [ ] #7 bun run lint, bun run fmt:check, bun run type-check, and the existing full test chain pass without weakening any product or browser check.
<!-- AC:END -->
