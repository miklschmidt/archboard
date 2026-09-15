---
id: TASK-218
title: Respect pane registration before browser board actions
status: Done
assignee:
  - '@codex'
created_date: '2026-09-15 00:44'
updated_date: '2026-09-15 01:21'
labels: []
dependencies: []
ordinal: 378000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports a frontend Show board failure: No pane is open; pane A-qz99fo names nothing; open the canvas in a browser first. This happened in the already-open frontend after a canvas restart. Investigate registration/reconnect ownership and prevent browser actions from addressing absent pane identities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An open frontend can show a board after the canvas restarts and reconnects.
- [x] #2 A deterministic regression covers the reproduced registration failure, and any remaining failure gives context appropriate to the browser.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the missing registration through the owning interface. 2. Fix lifecycle ordering or pane lookup at its owner. 3. Run focused regression and full gate, verify the frontend, and commit separately from theme work.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The reconnect already republishes its pane; the defect was reporting connected at socket-open before registration had been accepted. The session now reports connected only after registration, and board picker actions share the pane readiness predicate. Reconnecting actions give a browser-appropriate retry/reload notice; successful retry clears the stale refusal. Focused connection/picker regressions and both TypeScript projects pass; full non-browser suite passed.

Manual frontend verification after canvas restart and rebuilt frontend: connected pane switches from Semantic renderer draft to Archboard current and back with no Show board failure. Deterministic session test separately delays initial and reconnect registration acceptance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pane readiness now waits for accepted registration; board actions refuse reconnect gaps with an actionable browser notice and clear stale failures on success. Delayed registration regressions, manual browser board switching after reconnect, and full bun run check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
