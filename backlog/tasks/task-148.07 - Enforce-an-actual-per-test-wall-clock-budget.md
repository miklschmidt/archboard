---
id: TASK-148.07
title: Enforce an actual per-test wall-clock budget
status: In Progress
assignee: []
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 14:35'
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
  - bunfig.toml
  - src/shared/timing/timing.ts
  - tests/test-preload.ts
  - tests/support/test-wall-clock.ts
  - tests/system/repository-policy/support/test-wall-clock-policy.ts
  - tests/system/repository-policy/test-wall-clock-budget.test.ts
  - tests/system/code-targets/presentation-contract.test.ts
  - tests/system/browser/live-session-convergence.test.ts
  - docs/agents/test-suite.md
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
1. Add a Bun test preload whose captured monotonic clock measures each completed test and enforces the 20,000 ms default through an injectable reporter seam.
2. Add source-local structured approval for the real contention owner, including its TEST_* outer bound, reason, task, and measured evidence.
3. Extend repository policy to pin the preload in bunfig.toml and validate the stable declaration structure without policing timeout values or imports.
4. Add millisecond fixtures for under-budget, over-budget, approved contention, and obsolete approval-expiry elapsed shapes; run only the focused preload and repository-policy owners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the native Bun preload and injectable reporter seam. Bun.nanoseconds is bound when the preload loads, each unapproved case gets the 20,000 ms actual elapsed budget, and a source-local declaration supplies a reviewed real-time outer bound. Added structured declarations for the documented 42-cycle live browser owner and the measured 14,815.78 ms presentation contention owner. Repository policy now pins bunfig preload coverage and validates exact test name, reason, TEST_* bound, task, and evidence beside each owner.

Mutation RED: temporarily changed TEST_WALL_CLOCK_BUDGET_MS behavior from 20,000 to 100,000 ms and ran only the obsolete 91-second fixture. It failed in 25 ms because the reporter no longer threw. Restored 20,000 ms.

Focused validation: bun test --isolate ./tests/system/repository-policy/test-wall-clock-budget.test.ts passed 7 tests and 9 assertions in 87 ms. Focused Oxlint passed on all changed TypeScript files; oxfmt and git diff --check passed. Per assignment, did not run the real 14.816-second contention owner, live browser owner, tsc, broad repository/system/browser lanes, or bun run check.

Final focused rerun after stale-declaration reset: 7 tests and 9 assertions passed in 95 ms; focused Oxlint and git diff --check remained clean.
<!-- SECTION:NOTES:END -->
