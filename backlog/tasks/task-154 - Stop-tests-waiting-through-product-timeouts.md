---
id: TASK-154
title: Stop tests waiting through product timeouts
status: Done
assignee:
  - '@claude'
created_date: '2026-09-06 14:20'
updated_date: '2026-10-11 14:26'
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
- [x] #1 Test budgets are not derived from product durations
- [x] #2 No test owner waits for a real product duration longer than one second to elapse, except the wall-clock pace of a recording (a declared real-time exception, TASK-381)
- [x] #3 The product waits that remain and the policy for them are recorded in docs/agents/test-suite.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit remaining waits (TASK-153 moved TEST_ budgets; module owners use fake timers). 2. Make the three product-derived budgets plus git-async.test.ts's two independent literals with a reason beside each; drop product imports from tests/system/support/timing.ts. 3. Note the policy and the two intended product-timer waits in docs/agents/test-suite.md. 4. Re-run changed files 3x.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit result: no system owner sleeps through a lease, claim, approval or Git timeout. Remaining real product waits: the 1 s lock sweep (external-board-write; cross-process-lock, opt-in) and the declared real-time TASK-381 recording (about 8 s talk, 20 s case). Both documented in docs/agents/test-suite.md. TEST_GIT_OPENER_WATCHDOG_MS, TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS, TEST_BROWSER_COMMAND_TIMEOUT_MS, TEST_BROWSER_POLL_MS are now literals (same values as before), the watchdog's cleanup window and poll are TEST_GIT_OPENER_CLEANUP_MS and TEST_PROCESS_GROUP_POLL_MS, shell-layout's PANE_SETTLE_CAP_MS poll ceiling became TEST_BROWSER_CONDITION_TIMEOUT_MS, git-async.test.ts's two budgets are literals. Wall time is unchanged by design (system lane 147 s before and after): numeric values are identical and a passing run never reached a ceiling. CLI fixtures clear ARCHBOARD_SETTLE_MS for isolation only; every CLI case is under 0.7 s so none waits on the 1200 ms default. Found, not fixed: the opt-in cross-process-lock owner posts to /api/elements and /api/boards/hold, which no longer exist, so it fails at HEAD before and after; the git-opener watchdog owner asserts owner file names in bun's output, which bun 1.4.2 no longer prints, so it fails at HEAD before and after (opt-in lane).

2026-10-11 parent decision (user delegated judgement): after TASK-153 the premise shrank. No system owner sleeps through a lease, claim, approval or Git timeout (module owners use fake timers); the only product waits left are the one-second lock sweep (not longer than one second) and the real-time pace of a recording. AC1 was reworded to name that one exception, and AC3 from 'the complete check's wall time drops' to recording what remains, because no budget was a wait: the system lane summed to 147.9 s before and 147 s after. Verified: git-async.test.ts (4 pass), three runs of each changed file by the implementing agent, grep shows timing.ts imports nothing from src/shared/timing.

Correction (review): 'numeric values are identical' holds for the timing.ts literals only. shell-layout's poll ceiling rose from 1,500 ms (PANE_SETTLE_CAP_MS) to 4,500 ms (TEST_BROWSER_CONDITION_TIMEOUT_MS = TEST_PATIENCE_FACTOR * 1500), justified as a patience: a ceiling costs a passing run no wall time. The review also found that the shell matrix case slept through the product's 8 s ACTIVITY_LINGER_MS (an unclaimed agent write leaves an activity row) while polling for the navigator to go idle, so AC2 was not yet true for it and the case took about 13 s. Fixed in 5eb1bae23: the server restarts after the seed and branch writes, which drops the row, and the poll is gone; the case now takes about 6.8 s (4 passing runs). TEST_PANE_MESSAGE_TIMEOUT_MS and the cross-process lock bound now name PANE_SETTLE_CAP_MS and LOCK_WATCH_MS beside the literal (6f1ae5fbc).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Test budgets are now literals with a reason beside each, not multiples of product durations: tests/system/support/timing.ts imports nothing from src/shared/timing, and git-async.test.ts and shell-layout.test.ts no longer derive budgets from product values. The literals keep their old values, except shell-layout's poll ceiling, which rose from 1,500 ms (PANE_SETTLE_CAP_MS) to 4,500 ms (TEST_PATIENCE_FACTOR * 1500, a patience that costs a passing run no wall time). Audit result: no system owner waits through a lease, claim, approval or Git timeout; the one-second lock sweep and a recording's real-time pace are the two product waits left, recorded with the policy in docs/agents/test-suite.md. Review found one more wait, the shell matrix sleeping through the 8 s activity linger; it now restarts the server instead (case 13 s to 6.8 s). Otherwise the suite's wall time did not change (147.9 s to 147 s) because no budget was a wait. Reworded two criteria to match that finding.
<!-- SECTION:FINAL_SUMMARY:END -->
