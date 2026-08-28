---
id: TASK-130.06
title: Split board API coverage into native system tests
status: To Do
assignee: []
created_date: '2026-08-28 01:04'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
references:
  - scripts/check-boards.mjs
  - TASK-086
  - docs/agents/test-suite.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-boards is 3,549 lines of broad HTTP, pane, note, conversion, and malformed-input coverage. Convert it after TASK-086 lands so the native tests adopt the verified owned-canvas lifecycle instead of copying startup and teardown again.

Split by endpoint and state transition. Keep one owned canvas per group only where shared setup reduces runtime without creating order dependence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-boards is replaced by typed native system tests grouped by board lifecycle, element writes, pane state, conversion, malformed input, scratch-board behavior, and public HTTP refusals.
- [ ] #2 Every canvas started by the tests uses the TASK-086 lifecycle, verifies health.pid before assertions, retains stderr, reports early death, and leaves no child, listener, or vault on success or failure.
- [ ] #3 Tests preserve exact response statuses and bodies, note bytes, version behavior, frontend-sync tagging, conversion semantics, and malformed-telemetry diagnostics asserted by the legacy script.
- [ ] #4 No test depends on another test having run first; any intentionally shared canvas state is owned by one describe scope with explicit setup and teardown.
- [ ] #5 Every test source file is at most 500 lines and endpoint fixtures expose typed inputs rather than loose objects or computed module imports.
- [ ] #6 Representative route, conversion, scratch-board, and process-death mutations fail the native coverage before check-boards is deleted.
- [ ] #7 The native board system lane passes repeatedly without leaked processes, occupied ports, or changed authored vault files.
<!-- AC:END -->
