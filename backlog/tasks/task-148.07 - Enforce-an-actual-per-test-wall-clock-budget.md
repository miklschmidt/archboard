---
id: TASK-148.07
title: Enforce an actual per-test wall-clock budget
status: Done
assignee: []
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 17:27'
labels: []
dependencies:
  - TASK-143.08.01
  - TASK-148.01
  - TASK-148.02
  - TASK-148.03
  - TASK-148.04
  - TASK-148.05
  - TASK-148.06
modified_files:
  - package.json
  - bun.lock
  - bunfig.toml
  - docs/agents/test-suite.md
  - src/shared/timing/timing.ts
  - tests/test-preload.ts
  - tests/support/test-wall-clock.ts
  - tests/system/browser/human-edit-performance.test.ts
  - tests/system/browser/live-session-convergence.test.ts
  - tests/system/code-targets/presentation-contract.test.ts
  - tests/system/repository-policy/support/test-preload.ts
  - tests/system/repository-policy/support/test-wall-clock.ts
  - tests/system/repository-policy/support/test-wall-clock-policy.ts
  - tests/system/repository-policy/test-wall-clock-budget.test.ts
  - tests/system/repository-policy/test-wall-clock-preload.test.ts
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 278000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repository gate rejects unapproved slow test owners based on actual elapsed wall-clock time, without confusing declared timeout caps with elapsed runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A monotonic clock captured before fake timers enforces a 20,000 ms unapproved per-test elapsed-time budget; declared timeout caps that do not win do not fail.
- [x] #2 Static policy pins preload coverage and validates source-local structured declarations only. It does not ban timeout values or imports.
- [x] #3 A true real-time owner has a source-local structured reason, TEST_* outer bound, task reference, and evidence; no central filename allowlist or wildcard waiver exists.
- [x] #4 Positive and negative policy fixtures pass, the old 91-second approval-expiry shape fails, and the legitimate 14.816-second contention owner does not fail.
- [x] #5 The repository gate enforces the policy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the preload and wall-clock helper under repository-policy support so one documented owner owns shared test infrastructure.
2. Bind approvals inside exact test callbacks, reset them before each case, and make the reporter preserve an existing test/cleanup failure while adding the budget failure. Remove the presentation declaration; add exact live-session and human-performance declarations with named TEST_* bounds.
3. Replace regex policy with Bun.TOML parsing plus @babel/parser AST inspection that accepts only direct in-test declarations with inline literal fields and matching exact test names.
4. Add one millisecond real-preload child owner covering captured monotonic time, nested tests, failure composition, and non-inheritance, plus injected reporter fixtures. Mutation-check hook disconnection and the 20,000 ms default, then run only focused owners and scoped formatting/lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the native Bun preload and injectable reporter seam. Bun.nanoseconds is bound when the preload loads, each unapproved case gets the 20,000 ms actual elapsed budget, and a source-local declaration supplies a reviewed real-time outer bound. Added structured declarations for the documented 42-cycle live browser owner and the measured 14,815.78 ms presentation contention owner. Repository policy now pins bunfig preload coverage and validates exact test name, reason, TEST_* bound, task, and evidence beside each owner.

Mutation RED: temporarily changed TEST_WALL_CLOCK_BUDGET_MS behavior from 20,000 to 100,000 ms and ran only the obsolete 91-second fixture. It failed in 25 ms because the reporter no longer threw. Restored 20,000 ms.

Focused validation: bun test --isolate ./tests/system/repository-policy/test-wall-clock-budget.test.ts passed 7 tests and 9 assertions in 87 ms. Focused Oxlint passed on all changed TypeScript files; oxfmt and git diff --check passed. Per assignment, did not run the real 14.816-second contention owner, live browser owner, tsc, broad repository/system/browser lanes, or bun run check.

Final focused rerun after stale-declaration reset: 7 tests and 9 assertions passed in 95 ms; focused Oxlint and git diff --check remained clean.

Independent-review remediation: moved the preload and helper under the documented repository-policy owner; replaced file-wide hooks with exact in-test declarations reset before every case; added the measured 73.93-76.84 second human-edit owner and retained live-session owner; removed the sub-budget presentation declaration. Bun.TOML parses preload coverage and @babel/parser validates only direct, unaliased, first-statement declaration literals inside an exact matching test callback. Negative fixtures cover commented preload/fields, aliasing, indirect objects/functions, name mismatch, and wildcard names.

The real lifecycle owner uses one controlled Bun child and no sleep. A clock preload advances 25,000 ms per observation, the production preload binds it before the fixture installs fake timers and replaces Bun.nanoseconds, one approved slow case passes, an adjacent unapproved case fails, and a nested body plus cleanup failure remains visible beside the recovered budget diagnostic. Bun 1.4 skips outer afterEach and onTestFinished after a test-local cleanup failure, so the preload uses onTestFinished for ordinary enforcement and beforeEach/afterAll recovery to add the budget diagnostic without masking the original failures.

Remediation mutation RED: disconnecting onTestFinished made the lifecycle owner fail in 31 ms because the unapproved neighbor passed. Raising TEST_WALL_CLOCK_BUDGET_MS to 100,000 made both the exact 91,000 ms fixture and real preload lifecycle owner fail in 48 ms. Both mutations were restored. Final focused run passed 14 tests and 26 assertions across the policy and real-preload owners in 81 ms. Focused Oxlint, Oxfmt, bun install --frozen-lockfile, and git diff --check passed. No real browser owner, tsc, broad lane, old wrapper, or production-duration wait ran.

Final narrow Standards remediation: replaced the hand-written AstNode vendor shape and parse(... as unknown as AstNode) with @babel/types published Node/ObjectExpression types plus VISITOR_KEYS traversal; @babel/types 7.29.8 is now an exact direct dev dependency. Added TEST_WALL_CLOCK_PRELOAD_LIFECYCLE_TIMEOUT_MS = 5,000 with its three-fixture controlled-child constraint and used it for both the child and Bun case bounds. Focused final validation passed 14 tests / 26 assertions in 125 ms, focused Oxlint and Oxfmt passed, bun install --frozen-lockfile reported no changes in 185 ms, and git diff --check passed. No browser, tsc, broad lane, real wait, or old wrapper ran.

Canonical integration: cherry-picked reviewed commits bb554660b8b3dfd9c2444192b1972a3d0850e5c3, f3748679f68c182be49855fc5c14eaa24419fb63, and a6a9e9b4103de0704bc3092cd640860e4b2197e5. Focused integration validation passed: bun test --isolate ./tests/system/repository-policy/test-wall-clock-budget.test.ts ./tests/system/repository-policy/test-wall-clock-preload.test.ts — 14 tests, 26 assertions, 0 failures (121 ms). Per integration scope, no broad lanes were run.

Canonical typecheck remediation (2026-09-03): reproduced four TS2339 diagnostics at test-wall-clock-policy.ts:182-183 because the custom isNode predicate narrows to Babel's broad published Node union, which does not expose CallExpression.arguments or BlockStatement.body. Replaced those broad checks with Babel Node discriminant narrowing for CallExpression and BlockStatement; no casts, vendor lookalikes, regex fallback, or rule weakening.

Validation: the exact command bun run generate:codex-contract && bunx tsc --noEmit no longer reports test-wall-clock-policy.ts, but remains globally red on unrelated canonical diagnostics outside TASK-148.07. Focused policy/preload tests passed 14 tests, 26 assertions, 0 failures in 104 ms. Exact-file Oxlint, Oxfmt check, and git diff --check passed.

Review-clean AST-narrowing remediation: independently reviewed with zero Standards and zero Spec findings. Canonically integrated source commit 29d02265facf308714ed1b7781d95341571e069d as c20a4162; focused integration validation passed: bun test --isolate ./tests/system/repository-policy/test-wall-clock-budget.test.ts ./tests/system/repository-policy/test-wall-clock-preload.test.ts — 14 tests, 26 assertions, 0 failures (108 ms). The scheduled combined typecheck and complete gate remain owned by TASK-143.08.05.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Enforced the per-test 20,000 ms wall-clock policy with source-local approved real-time bounds and AST-backed policy validation; the review-clean AST narrowing remediation preserves that contract. Focused repository-policy and preload validation passed: 14 tests, 26 assertions, 0 failures.
<!-- SECTION:FINAL_SUMMARY:END -->
