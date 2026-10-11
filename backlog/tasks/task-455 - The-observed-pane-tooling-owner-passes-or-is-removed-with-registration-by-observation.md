---
id: TASK-455
title: >-
  The observed pane tooling owner passes or is removed with registration by
  observation
status: Done
assignee:
  - '@implementer'
created_date: '2026-10-11 14:16'
updated_date: '2026-10-11 14:17'
labels:
  - testing
dependencies: []
priority: low
type: bug
ordinal: 806000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/support/observed-pane.test.ts (opt-in lane test:opt-in:tooling) fails with four 15 s timeouts at HEAD (found 2026-10-11 while auditing TASK-154). TASK-436.16 removed registration by observation, which may have left the owner and its support code testing something that no longer exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tooling owner passes against what the product does today, or it and its unused support code are removed
- [x] #2 bun run test:opt-in:tooling passes, or what it ran is gone
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Cause: fixture server in observed-pane.test.ts still sends initial_elements, the product (websocket-connection.ts sendStartingBoard) sends pane_board, which openObservedPane waits for. TASK-436.16 (repo registration) is unrelated; helper is used by pane-websocket.ts and server-state/support/pane-session.ts. Repair the fixture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: the observed-pane.test.ts fixture server sent initial_elements, a message the product no longer sends; openObservedPane waits for pane_board (src/server/archboard/lib/websocket-connection.ts sendStartingBoard), so all four tests hit the 15 s readiness timeout. TASK-436.16 was about repo registration and is unrelated. The helper is still used by pane-websocket.ts (openTestPane) and server-state/support/pane-session.ts, so the owner guards a live contract: repaired the fixture. bun test observed-pane.test.ts: 4 pass. bun run test:opt-in:tooling x3: 30 pass, 0 fail, 6 files each.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixture server in observed-pane.test.ts now sends pane_board like the product. Owner passes; test:opt-in:tooling passes three times (30 tests, 6 files).
<!-- SECTION:FINAL_SUMMARY:END -->
