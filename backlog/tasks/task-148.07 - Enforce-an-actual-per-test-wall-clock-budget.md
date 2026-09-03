---
id: TASK-148.07
title: Enforce an actual per-test wall-clock budget
status: In Progress
assignee: []
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 17:03'
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
- [ ] #1 A monotonic clock captured before fake timers enforces a 20,000 ms unapproved per-test elapsed-time budget; declared timeout caps that do not win do not fail.
- [ ] #2 Static policy pins preload coverage and validates source-local structured declarations only. It does not ban timeout values or imports.
- [ ] #3 A true real-time owner has a source-local structured reason, TEST_* outer bound, task reference, and evidence; no central filename allowlist or wildcard waiver exists.
- [ ] #4 Positive and negative policy fixtures pass, the old 91-second approval-expiry shape fails, and the legitimate 14.816-second contention owner does not fail.
- [ ] #5 The repository gate enforces the policy.
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
<!-- SECTION:NOTES:END -->
