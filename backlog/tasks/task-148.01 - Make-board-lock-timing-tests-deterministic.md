---
id: TASK-148.01
title: Make board-lock timing tests deterministic
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 14:04'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lock-test owners prove lease expiry, renewal, refusal, recovery, and peer teardown without consuming production lease or retry durations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focused board-claim, board-lock-announcements, board-lock-api, and resource-cleanup lease-expiry owners use deterministic control or observable synchronization instead of real lease or retry waiting.
- [ ] #2 Lock expiry, renewal, refusal, recovery, and real peer teardown behavior remain asserted, with focused duration evidence recorded.
- [ ] #3 The resource-cleanup 3100 ms lease wait is removed; any retained OS TERM-to-KILL physical-time proof stays under four seconds behind a source-local TEST_* outer bound.
- [ ] #4 No production timing value changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Put the three same-process lock owners under Bun fake timers and advance the lock poll, renewal, watch, linger, steal-guard, and claim-expiry clocks explicitly while retaining state, message, holder, and cleanup assertions.
2. Remove both production wait-cap passages from the black-box board-lock API owner; retain its hold, renewal, release, claim, takeover, and immediate revoked-refusal HTTP contracts, and pin the default BOARD_HELD wait/cap behavior at the deterministic module seam.
3. Replace resource-cleanup's post-SIGKILL lease sleep with an expired on-disk lock timestamp, while keeping the real 1900-4000 ms TERM-to-KILL proof behind a named TEST_* bound.
4. Run mutation-red checks at the lock seam, focused owners, type/lint and directly relevant repository policy; audit processes, temporary artifacts, and the worktree; then record evidence and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented deterministic Bun fake-time control in board-claim, board-lock-announcements, and board-lock-lease. The unit seam now advances poll, default wait cap, steal guard, renewal, watch, linger, and claim expiry explicitly. BOARD_HELD code/board/holder/message/default waitedMs remain asserted there; the process owner retains HTTP hold/renew/release plus CLAIM_REVOKED 409 and document/version refusal coverage without paying two default wait caps. Resource cleanup now expires the killed peer's persisted lock record directly and retains the real SIGTERM-to-SIGKILL 1900 ms lower bound with TEST_TERM_TO_KILL_MAX_MS = 4000. No production timing or production source changed.

Baseline focused run: 12 pass in 28.53 s; board-lock-api 12.16 s, resource-cleanup stubborn peer 5.25 s, announcements 3.44 s, lease 0.53 s, claims 6.41 s. Green focused run: 12 pass in 5.13 s; board-lock-api 2.25 s, stubborn peer 2.17 s, announcements 1.48 ms, lease 5.17 ms, claims 2.86 ms. Mutation-red evidence: default cap 5000 -> 4999 failed exact waitedMs in 4.96 ms; linger +1 ms failed held/free news in 1.30 ms; disabled renewal failed retained claim holder in 7.93 ms. Type-check, focused Oxlint/Oxfmt, git diff check, and repository test inventory passed.

Recovery at fixed base 7d55ebeb found the recorded deterministic implementation in ancestor f9c2a89c. A later cancellation regression in board-lock-lease still referenced the removed real-timer registry and awaited its abort before advancing fake time. The owner now starts the request, advances 25 ms explicitly, and then asserts cancellation. Recovery validation: board-lock-lease 2 pass in 0.13 s; board-claim 1 pass in 0.14 s; board-lock-announcements 1 pass in 0.12 s; board-lock-api 1 pass in 2.50 s; TERM-resistant resource cleanup 1 pass in 2.27 s. Exact-file Oxlint, Oxfmt, and git diff checks passed. Production source and timing values remain unchanged.
<!-- SECTION:NOTES:END -->
