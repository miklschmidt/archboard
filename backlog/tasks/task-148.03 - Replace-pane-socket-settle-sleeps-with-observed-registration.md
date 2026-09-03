---
id: TASK-148.03
title: Replace pane socket settle sleeps with observed registration
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 14:26'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 274000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pane tests wait for an observable registration contract rather than a fixed socket-settle delay, making the shared test helper reliable and faster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 openTestPane and its 15 consumers replace the fixed 80 ms settle delay with deterministic readiness acknowledgement or observed registration.
- [x] #2 The scope covers pane-websocket.ts, canvas-state/support/pane-session.ts, and applicable direct post-open sleeps.
- [x] #3 Focused coverage preserves open and close behavior, multi-pane isolation, and cleanup.
- [x] #4 Measured aggregate duration is materially lower than the fixed-delay baseline.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the current focused pane-owner aggregate through the approved capped-command wrapper.
2. Add one shared test-support readiness seam that waits for the server's initial pane frame and requires the existing /api/panes registered acknowledgement before an opener returns. Reuse it from both pane-websocket.ts and canvas-state/support/pane-session.ts without changing production code.
3. Replace applicable fixed post-close registry waits with observed unregistration while preserving negative-event observation windows that test absence rather than socket readiness.
4. Run exact focused owners and exact-file lint/format checks through the wrapper, compare duration with baseline, audit cleanup and BASE..HEAD, then commit for independent review.

5. Bound registration, registry reads, socket close, and open-failure cleanup with TEST_PANE_MESSAGE_TIMEOUT_MS and AbortSignal-aware callbacks; reject malformed registry responses with the observed body.
6. Move predicate-based event waiting into ObservedPane, leave adapter waits as thin delegates, and add one focused support owner for timeout cleanup, malformed registry evidence, and client-id isolation.
7. Run only the exact support and affected behavior owners directly, then commit and request complete rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a shared observed-pane test seam. It waits for initial_elements, requires the existing registered=true pane telemetry acknowledgement, provides an ordered WebSocket barrier for negative message assertions, and observes registry removal before close returns. Both pane support adapters use it; fixed 80 ms waits and TEST_PANE_SOCKET_SETTLE_MS are gone. Positive branch notifications now wait for the exact board-scoped elements_changed frame.

Focused evidence: the five directly changed behavior owners passed 22/22 in 12.53s. Exact-file Oxlint and Oxfmt passed. The same 16-owner aggregate improved from Bun-reported 65.76s at base to 61.83s after the change, 3.93s or 6.0%. The aggregate retained three base failures in import-replace-one-write, snapshot-one-write, and held-board-recovery; all three also failed before this change. A fourth baseline race in branching-pane-effects passed after exact message observation.

Independent-review remediation: bounded pane registration and each registry read with AbortSignal-aware TEST_PANE_MESSAGE_TIMEOUT_MS operations; bounded the complete close path, force-terminating a socket that does not close; and routed open failures through the same awaited cleanup. Registry absence now requires HTTP 200, success=true, a panes array, and string client ids. ObservedPane now owns the only predicate polling loop, while both adapters delegate. Added a focused loopback owner with fake timers for registration abort and cleanup, close termination, malformed registry evidence, and exact client-id isolation.

Remediation validation: observed-pane.test.ts passed 4/4 in 28 ms. The directly affected doing-activity, pane-addressing, and branching-pane-effects owners passed 11/11 in 7.08 s. Exact-file Oxfmt and Oxlint passed.

Narrow type remediation: pane-websocket.ts now reuses the exported JsonRequestOptions contract, so AbortSignal is accepted without an excess-property error. Exact-file Oxfmt/Oxlint passed; pane-addressing passed 7/7 in 4.05 s.

Integration evidence: cherry-picked f1233a05, 08639dfc, and de2a6902 onto eb128292. Independent rereview reported REVIEW_CLEAN. bun test --isolate tests/system/support/observed-pane.test.ts passed 4/4 in 36 ms. bun test --isolate tests/system/boards/pane-addressing.test.ts passed 7/7 in 4.03 s. The task's prior focused 16-owner aggregate measured 61.83 s versus a 65.76 s baseline, a 3.93 s or 6.0% reduction.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced fixed pane socket settle waits with observed registration and cleanup. Integrated the three reviewed commits and verified with observed-pane 4/4 plus pane-addressing 7/7; the recorded focused aggregate fell from 65.76 s to 61.83 s, a 6.0% reduction.
<!-- SECTION:FINAL_SUMMARY:END -->
