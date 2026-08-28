---
id: TASK-130.01
title: 'Put native tests under TypeScript, lint, and boundary enforcement'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 01:02'
updated_date: '2026-08-28 05:00'
labels: []
dependencies: []
references:
  - tsconfig.json
  - .oxlintrc.jsonc
  - tools/oxlint-plugin-archboard.js
  - docs/agents/boundaries.md
  - src/cli/command-contract/tests/command-contract.test.ts
  - 'https://bun.com/docs/typescript-6'
modified_files:
  - .oxlintrc.jsonc
  - bun.lock
  - docs/agents/boundaries.md
  - package.json
  - scripts/check-boundary-plugin.mjs
  - src/cli/command-contract/tests/command-contract.test.ts
  - src/cli/command-contract/tests/artifact-output.test.ts
  - src/cli/command-contract/tests/introspection.test.ts
  - src/cli/command-contract/tests/runner.test.ts
  - src/cli/command-contract/tests/schemas.test.ts
  - src/cli/command-contract/tests/support.ts
  - src/cli/finding-rendering/tests/finding-rendering.test.ts
  - tools/oxlint-plugin-archboard.js
  - tsconfig.json
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin @types/bun@1.4.0 and packageManager bun@1.4.0; raise engines.bun to >=1.4.0.
2. Expand the existing strict no-emit tsconfig.json, not a new test config, to cover src/**/*.ts, tests/system/**/*.ts, scripts/**/*.ts, and tools/**/*.ts with node+bun types; remove test/spec excludes and keep generated/vendor/build paths out through exact roots/excludes.
3. Document exactly two path owners and implement a test-owner classifier in archboard/module-entrypoints. Allow same-owner helpers and product root entrypoints. Reject deep product imports, product-to-test imports, cross-owner test imports, invalid placement, and new untyped JS-like test/support sources; retain one exact documented exception for public-runner-fixture.mjs until TASK-130.11. Recognize every Bun 1.4 discovery spelling when detecting misplaced runnable tests.
4. Remove the blanket test/spec lint override. Extend the normal authored-code baseline to tests/system and future typed scripts/tools so system tests do not get a different accidental rule set. Keep only scripts/**/*.mjs until TASK-130.11.
5. Use built-in max-lines at 500 physical lines on TS source under both test roots. No custom line-count rule and no per-file exception. Put large authored data in named non-TS fixture files.
6. Extend scripts/check-boundary-plugin.mjs with the exact allowed/denied owner matrix above, a 501-line fixture, and one public bun run type-check probe containing unimported errors in module support, system support, scripts, and tools. Assert paths, rule ids, and guidance fragments; clean in finally.
7. Split command-contract.test.ts into runner.test.ts, artifact-output.test.ts, introspection.test.ts, schemas.test.ts, plus same-owner support.ts. Preserve all 27 tests, all protected golden rows, public-runner subprocess behavior, bytes/order/inode/cleanup assertions, and keep every TS file <=500.
8. Run focused config/boundary/type/command-contract gates, then bun run lint, bun run fmt:check, bun run type-check, and the existing full bun run test chain sequentially. Confirm Oxlint type-aware debug assignment includes a module test and a system test. Keep browser lanes headless and serial.
9. Leave the MJS conversions and final lane cutover to TASK-130.02 and TASK-130.11. Do not add a shared test framework.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved foundation without a second tsconfig or a shared test framework.

- Root TypeScript and Oxlint discovery now cover module tests, system tests, scripts, and tools with Bun 1.4 declarations.
- The boundary plugin enforces the two test owners, same-owner support, root-entrypoint product imports, product-to-test and cross-owner refusals, placement rules, and typed-source rules. Only public-runner-fixture.mjs is temporarily excepted.
- Built-in eslint/max-lines enforces 500 physical lines on both authored TypeScript test roots.
- The command-contract suite is split into four contract-focused test files plus same-owner support while retaining all 27 literal tests and protected subprocess, golden, byte, order, inode, and cleanup behavior.
- The boundary probe covers the allowed/denied import matrix, oversized files, Oxlint type-aware assignment, and unimported errors in module support, system support, scripts, and tools.

Validation:
- bun run test:boundaries
- bun test src/cli/command-contract/tests src/cli/finding-rendering/tests: 37 pass, 0 fail, 199 expect, 5 files
- bun run lint
- bun run fmt:check: 257 files
- bun run type-check
- bun run test: complete unchanged chain passed sequentially, including headless browser lanes; human-performance, fixed-point zero diff for 18 elements, typed-text, and live-session 42 cycles
- git diff --check

No browser lane failed.

Rereview remediation:
- Added disposable misplaced Bun underscore probes at tests/widget_test.ts and tests/widget_spec.ts.
- Each probe must report archboard(module-entrypoints) and the stable "must live under" placement guidance.
- Both paths are listed in createdFiles and removed in finally.
- Kept the existing widget.test.ts and misplaced.spec.ts dot-form probes unchanged in coverage.
- Validation: bun run test:boundaries passed; focused Prettier check passed; focused Oxlint passed; git diff --check passed.

Validation record correction: the final focused formatter check used the repository-pinned Oxfmt. The earlier Prettier run was discarded because it produced unrelated whitespace churn.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-28 04:51
---
Implementation complete and validated; ready for independent review against the fixed commit range.
---

author: @codex
created: 2026-08-28 04:59
---
Applied the independent review remediation. The task remains In Progress with acceptance criteria unchecked pending rereview.
---
<!-- COMMENTS:END -->
