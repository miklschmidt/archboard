---
id: TASK-130.02
title: Convert repository policy checks to native Bun tests
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 01:02'
updated_date: '2026-08-28 05:56'
labels: []
dependencies:
  - TASK-130.01
references:
  - scripts/check-ci-suites.mjs
  - scripts/check-boundary-plugin.mjs
  - scripts/check-module-scope.mjs
  - scripts/check-skills.mjs
  - docs/agents/test-suite.md
modified_files:
  - package.json
  - tests/system/repository-policy/test-inventory.test.ts
  - tests/system/repository-policy/support/test-inventory.ts
  - tests/system/repository-policy/boundaries.test.ts
  - tests/system/repository-policy/module-scope-policy.test.ts
  - tests/system/repository-policy/support/module-scope-analysis.ts
  - tests/system/repository-policy/skills.test.ts
  - tests/system/repository-policy/fixtures/module-scope
  - scripts/check-ci-suites.mjs
  - scripts/check-boundary-plugin.mjs
  - scripts/check-module-scope.mjs
  - scripts/check-skills.mjs
  - scripts/fixtures/module-scope
  - docs/agents/test-suite.md
  - src/dev-canvas.ts
  - src/runtime/engine/reload-canary.ts
  - scripts/check-hot-reload.mjs
parent_task_id: TASK-130
priority: medium
type: chore
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repository policy checks currently run as self-reporting scripts with process.exit and console output. Convert check-ci-suites, check-boundary-plugin, check-module-scope, and check-skills into typed native tests. Preserve their self-tests and real subprocess boundaries.

This task owns the evolving test inventory rule. During migration it must understand both remaining legacy script lanes and native Bun test lanes, refuse an omitted test, and refuse a test reached by more than one lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-ci-suites, check-boundary-plugin, check-module-scope, and check-skills are replaced by typed bun:test files under the repository-policy system-test ownership defined by TASK-130.01.
- [ ] #2 The boundary and module-scope tests still run their real Oxlint or TypeScript parser paths against temporary fixtures and assert the exact allowed and refused classes documented today.
- [ ] #3 Every temporary fixture is removed after success and assertion failure, and no test mutates authored repository files.
- [ ] #4 A native inventory test fails when a package test lane is absent from the push chain, a native test belongs to no lane, or a native test can run through more than one lane.
- [ ] #5 The existing negative self-tests remain executable through named native assertions rather than a command-line self-test mode.
- [ ] #6 The legacy scripts are deleted only after focused parity runs prove the native tests catch their documented failure fixtures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependency and ownership. Start after TASK-130.01 lands and rebase onto its root strict no-emit configuration, two test owners, module-root import rule, and 500-line test limit. This task owns the first serialized transitional package cutover. It edits package.json only during reconciliation, preserving the existing script names. TASK-130.11 later consolidates final lane names and layout and removes remaining non-check MJS. It does not delete this task's predecessor checks.

2. Exact legacy-to-native mapping, all tests/system-owned under tests/system/repository-policy:
- scripts/check-ci-suites.mjs -> test-inventory.test.ts plus support/test-inventory.ts.
- scripts/check-boundary-plugin.mjs -> boundaries.test.ts.
- scripts/check-module-scope.mjs -> module-scope-policy.test.ts plus support/module-scope-analysis.ts.
- scripts/check-skills.mjs -> skills.test.ts.
- scripts/fixtures/module-scope/answers-every-message-twice.ts, binds-the-port-again.ts, blanks-a-kept-board.ts, reload-safe.ts, rewinds-a-mutable-literal.ts, and starts-a-second-timer.ts -> byte-identical fixtures/module-scope/*.fixture.ts.txt.
The txt suffix marks parser fixture data rather than executable support. support/test-inventory.ts evaluates typed lane and test reachability records. support/module-scope-analysis.ts owns TypeScript AST and import-graph mechanics. Boundary tables and skill YAML or Markdown examples stay literal in their tests.

3. Contracts under 500 lines. test-inventory.test.ts runs against the real checkout and names synthetic failures for a package lane absent from the push chain, an unowned native test, a multiply reachable native test, a missing transitional legacy lane, and a passing mixed legacy/native inventory. boundaries.test.ts runs the real Oxlint plugin in fresh temporary projects for every existing allowed and refused root, deep, require, Vite raw, flat-area, and test-placement case. module-scope-policy.test.ts keeps named new-state, mutable-literal, timer, listener, bind, long-lived-mutation, safe-code, and hot-safe waiver assertions, then scans the real dev-canvas and server graph through TypeScript. skills.test.ts keeps the valid and invalid frontmatter, YAML, metadata, fenced-table, escaped-pipe, unescaped-pipe, and real skills-tree cases.

4. Parity and serialized cutover. Author only the disjoint native files before reconciliation. In a disposable checkout, prove the old and new implementations fail for the same deliberate regressions: remove a reachable lane, relax one entrypoint refusal, disable listener or timer detection, and add an unescaped skill-table pipe. Preserve and compare the six parser fixture bytes. Once parity is recorded, the reconciliation owner performs one serialized integration:
- Map package.json test:suites to bun test tests/system/repository-policy/test-inventory.test.ts.
- Map test:boundaries to bun test tests/system/repository-policy/boundaries.test.ts.
- Map test:module-scope to bun test tests/system/repository-policy/module-scope-policy.test.ts.
- Map lint:skills to bun test tests/system/repository-policy/skills.test.ts while preserving its existing reachability through lint and bun run check.
- Delete scripts/check-ci-suites.mjs, scripts/check-boundary-plugin.mjs, scripts/check-module-scope.mjs, scripts/check-skills.mjs, and the six superseded scripts/fixtures/module-scope paths.
Do not mutate authored files during test execution. Temporary projects and disposable checkouts are removed in finally on success and failure.

5. Inventory and acceptance boundary. After the cutover, the real mixed-checkout inventory must pass. bun run check must reach test-inventory.test.ts, boundaries.test.ts, module-scope-policy.test.ts, and skills.test.ts exactly once through the preserved package entrypoints. The inventory must still understand remaining legacy script lanes for later tasks while refusing every unowned or multiply reached native test. This task is not accepted with a synthetic-only inventory or a deferred TASK-130.11 fix.

6. Validation and integration order. Run:
bun test tests/system/repository-policy/test-inventory.test.ts tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/module-scope-policy.test.ts tests/system/repository-policy/skills.test.ts
Then run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Do not parallelize broad validation. Integrate this task before any later native test task. Once its inventory is live, every later native test integration must include its package mapping and legacy deletion so the real inventory remains green at every merge point.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved first serialized cutover. The four preserved package keys now run native Bun tests under tests/system/repository-policy. The mixed inventory follows package-script reachability from check, accepts remaining legacy lanes, and rejects missing, unowned, and multiply owned native tests. Boundary assertions use fresh disposable projects and real Oxlint or TypeScript subprocesses. Module-scope fixtures are byte-identical parser data copied to temporary .ts files and removed after the suite.

Parity before deletion: in a disposable checkout, both old and new implementations rejected an omitted push lane, a relaxed root-entrypoint refusal, disabled timer detection, and an unescaped skill-table pipe. cmp proved all six replacement fixture byte streams identical before the old paths were removed. The disposable checkout was removed.

Validation: focused repository-policy suite 28 pass, 0 fail, 97 expectations; bun run type-check; bun run lint; bun run fmt:check; bun run test:suites 6 pass; git diff --check; full sequential bun run check passed, including all four headless browser lanes, fixed-point 0 of 18 changed, and live-session 42 of 42 cycles agreed. No browser lane failed.

Independent-review remediation completed without changing the fixed base. Restored named CI workflow-policy tests against the real .github/workflows/ci.yml: the workflow must run bun run check and must not directly name test:* lanes, with predecessor diagnostics preserved. Inventory ownership now sums push-reachable invocation counts across every matching owner lane, including non-test scripts; named negatives prove an unreachable verify owner is zero-run and a reachable non-test owner invoked twice is duplicate. Boundary tests now copy the repository-owned tsconfig.json byte-for-byte and adapt only the Oxlint plugin path in repository-owned .oxlintrc.jsonc. Restored the documented public-runner-fixture.mjs allowance and the cross-module private deep-import refusal.

TDD evidence: the first focused run failed because disposable boundary projects lacked .oxlintrc.jsonc. After adding only the workflow inspector, the focused inventory run had exactly three intended failures: the prior duplicate diagnostic lacked execution counts, an unreachable verify owner was not zero-run, and a twice-invoked reachable non-test owner was not duplicate. Green focused inventory plus boundaries: 19 pass, 86 expectations. Final exact four-file suite: 34 pass, 107 expectations.

Remediation validation: bun run type-check; bun run lint; bun run fmt:check; bun run test:suites (11 pass); git diff --check; full sequential bun run check passed, including all four headless browser lanes and live-session 42/42 cycles. SHA-256 comparisons prove all six moved module-scope fixture byte streams still match fixed BASE 071b56e4b9ded18ba81e52b27f6e1171fa1df490.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-28 05:38
---
Implementation and validation are complete. TASK-130.02 remains In Progress with acceptance criteria unchecked for independent fixed-range review.
---

author: @codex
created: 2026-08-28 05:55
---
Independent-review remediation is implemented and validated. TASK-130.02 remains In Progress with all acceptance criteria unchecked for fixed-range rereview.
---
<!-- COMMENTS:END -->
