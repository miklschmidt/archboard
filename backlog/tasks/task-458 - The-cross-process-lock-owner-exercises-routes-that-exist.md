---
id: TASK-458
title: The cross-process lock owner exercises routes that exist
status: Done
assignee:
  - '@claude'
created_date: '2026-10-11 14:15'
updated_date: '2026-10-11 15:51'
labels:
  - testing
dependencies: []
priority: low
type: bug
ordinal: 804000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/process-contracts/cross-process-lock.test.ts (opt-in lane test:opt-in:topology) posts to /api/elements and /api/boards/hold. Neither route exists any more, so the server answers HTML and the test dies on a JSON parse. Found 2026-10-11 while auditing TASK-154; it fails at HEAD. The lock sweep it was written for still exists (one second) and is a product contract: a second process that writes a board must reach the panes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cross-process lock behavior it was written to guard is proven against the board write path that exists today, or the owner is deleted with the reason that another owner already proves it
- [x] #2 bun run test:opt-in:topology passes, or the script and the file are gone
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Nothing else proves the cross-process lock sweep (board-lock-announcements tests only passenger failure; board-lock-api is one server). Rewrite against /api/semantic-boards/{create,claim,claim/release,edit}: server B on the same vault claims, server A's pane hears board_lock within the sweep bound, A's write is refused BOARD_HELD, release reaches the pane, A can write again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
This record used TASK-453 on main. The supported Backlog doctor repair assigns TASK-458 after its collision with the independent retrospective validation task. Historical main commit references retain the former number. The original task content and completion evidence remain unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Nothing else owned the cross-process claim to pane path: board-lock-announcements tests only passenger failure and board-lock-api uses one server. Rewrote cross-process-lock.test.ts against /api/semantic-boards create, claim, claim/release and edit: a claim taken through a second server on the same vault reaches the first server's pane within TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS, the first server's write is refused BOARD_HELD, release reaches the pane, and the write then lands. bun run test:opt-in:topology passed 3 of 3 runs (~3.5s).
<!-- SECTION:FINAL_SUMMARY:END -->
