---
id: TASK-154
title: Stop tests waiting through product timeouts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-06 14:20'
updated_date: '2026-10-11 14:11'
labels: []
dependencies: []
priority: medium
ordinal: 306000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Many system and browser owners wait for a real product duration to elapse (lock leases, watch intervals, the 90 s approval expiry) and their budgets in the timing module are multiples of product values, so the suite's wall time is set by product timeouts and a product change silently retunes forty test budgets. Each such owner should get an injected clock or a shortened lease so no test sleeps through a product timeout. Origin: the TASK-153 audit of the timing module.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No test owner waits for a real product duration longer than one second to elapse
- [x] #2 Test budgets are not derived from product durations
- [ ] #3 The complete check's wall time drops and the change is recorded in docs/agents/test-suite.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit remaining waits (TASK-153 moved TEST_ budgets; module owners use fake timers). 2. Make the three product-derived budgets plus git-async.test.ts's two independent literals with a reason beside each; drop product imports from tests/system/support/timing.ts. 3. Note the policy and the two intended product-timer waits in docs/agents/test-suite.md. 4. Re-run changed files 3x.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit result: no system owner sleeps through a lease, claim, approval or Git timeout. Remaining real product waits: the 1 s lock sweep (external-board-write; cross-process-lock, opt-in) and the declared real-time TASK-381 recording (about 8 s talk, 20 s case). Both documented in docs/agents/test-suite.md. TEST_GIT_OPENER_WATCHDOG_MS, TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS, TEST_BROWSER_COMMAND_TIMEOUT_MS, TEST_BROWSER_POLL_MS are now literals (same values as before), the watchdog's cleanup window and poll are TEST_GIT_OPENER_CLEANUP_MS and TEST_PROCESS_GROUP_POLL_MS, shell-layout's PANE_SETTLE_CAP_MS poll ceiling became TEST_BROWSER_CONDITION_TIMEOUT_MS, git-async.test.ts's two budgets are literals. Wall time is unchanged by design (system lane 147 s before and after): numeric values are identical and a passing run never reached a ceiling. CLI fixtures clear ARCHBOARD_SETTLE_MS for isolation only; every CLI case is under 0.7 s so none waits on the 1200 ms default. Found, not fixed: the opt-in cross-process-lock owner posts to /api/elements and /api/boards/hold, which no longer exist, so it fails at HEAD before and after; the git-opener watchdog owner asserts owner file names in bun's output, which bun 1.4.2 no longer prints, so it fails at HEAD before and after (opt-in lane).
<!-- SECTION:NOTES:END -->
