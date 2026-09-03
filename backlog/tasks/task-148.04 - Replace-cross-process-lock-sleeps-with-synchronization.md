---
id: TASK-148.04
title: Replace cross-process lock sleeps with synchronization
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 14:11'
labels: []
dependencies: []
modified_files:
  - src/shared/timing/timing.ts
  - tests/system/process-contracts/cross-process-lock.test.ts
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 275000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cross-process lock owners synchronize on watcher and lease observations instead of arbitrary elapsed delays, keeping the integration facts they actually prove.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The arbitrary 1200 ms, 1500 ms, and 1200 ms cross-process lock delays are replaced with explicit watcher or lease observations.
- [x] #2 Coverage retains ownership, expiry or handoff, and cleanup behavior.
- [x] #3 A real elapsed wait remains only when it proves a genuine integration fact; its reason, measurement, and TEST_* outer bound are documented locally.
- [x] #4 Cross-process watcher delivery is measured after raw sleeps move to observable conditions before any waiver is considered.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the three elapsed sleeps in the existing cross-process owner with predicate-based board_lock observations. Keep the human takeover held until the original canvas reports that exact owner, then release and observe both canvases report free before asserting the told-once revocation.
2. Measure each cross-process watcher delivery from the completed lock mutation to its matching frame and bound it with one named TEST_* constant documented beside the lock timing policy for TASK-148.04. Leave production lease, renewal, and watcher values unchanged.
3. Run only the focused cross-process owner plus exact-file lint and format checks through the verified capped runner. Audit BASE..HEAD, owned processes, and temporary artifacts, then commit for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the two 1,200 ms sleeps and the LOCK_RENEW_MS + 500 ms wait in the cross-process owner with ordered board_lock observations. The owner now observes the recovered writer hold and release, measures remote claim delivery, keeps the human takeover held until the original canvas observes that exact owner, observes both canvases return to free, and then asserts CLAIM_REVOKED. Added TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS as a test-only outer bound composed from LOCK_WATCH_MS; production lock timing is unchanged.
Focused validation through the verified capped runner: cross-process-lock.test.ts passed three times at 15.97s, 16.15s, and 15.98s. Exact-file Oxlint and oxfmt checks passed for the owner and timing.ts.

Integrated reviewed commit 274485d6 (from 10be871). The focused owner passed: timeout -k 5s 20s bun test tests/system/process-contracts/cross-process-lock.test.ts, 1 pass and 26 assertions in 15.70 s. The test now waits for matching board_lock frames across the peer canvases, retains ownership, handoff, revocation, and cleanup coverage, and measures each remaining real watcher wait under TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the raw cross-process lock sleeps with matching lock-frame observations. Verified the ownership, handoff, release, revocation, cleanup, and measured watcher-delivery contract with the focused process test: 1 pass, 26 assertions.
<!-- SECTION:FINAL_SUMMARY:END -->
