---
id: TASK-535
title: A system pane is registered only after the news of its registration arrives
status: Done
assignee: []
created_date: '2026-10-25T05:55:00Z'
updated_date: '2026-10-25T06:00:00Z'
labels: []
dependencies: []
ordinal: 957000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The full gate of TASK-532 failed once in tests/system/server-state/doing-activity.test.ts: the pane showing "ledger" heard a board_doing about "ledger" after its mark, where the test expects only news about "payments". POST /api/panes calls arrivedOnBoard, which sends the board lock and its recent doing lines over the socket before the HTTP answer. The observed-pane helper in tests/system/support/observed-pane.ts resolved register on the HTTP answer alone, so under machine load that replay could arrive after a test took its mark. The test passed five runs out of five alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A system pane's register resolves only after every socket message that the server sent for the registration has arrived
- [x] #2 doing-activity.test.ts and the system lane pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move the socket barrier (ping and pong) of openObservedPane into a function that sync and register share, and run it after a successful registration.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No board is affected: the change is in a system test helper. Verified: lint:tests, types and format:check pass; observed-pane.test.ts, doing-activity.test.ts and vault-naming.test.ts pass (8 tests); the system lane passes, 260 tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
openObservedPane's register now waits for a socket barrier (a ping whose pong the server writes after every earlier frame) after a successful registration, so the lock and doing lines that POST /api/panes sends before its answer have arrived before a test takes its mark. sync and register share one module-level socketBarrier. This removes the race that failed doing-activity.test.ts once under machine load in the full gate of TASK-532.
<!-- SECTION:FINAL_SUMMARY:END -->
