---
id: TASK-130.08
title: Convert canvas state and session checks to native system tests
status: To Do
assignee: []
created_date: '2026-08-28 01:04'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
references:
  - scripts/check-branch-compare.mjs
  - scripts/check-changes.mjs
  - scripts/check-doing.mjs
  - scripts/check-hot-reload.mjs
  - scripts/check-side-by-side.mjs
  - scripts/check-staleness.mjs
  - scripts/check-version.mjs
  - TASK-086
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Convert the non-browser checks for branch comparison, change feeds and injection, doing, hot reload, side-by-side panes, staleness, and board versions. These tests share canvas lifecycle and session mechanics but assert distinct public state transitions.

Reuse the completed TASK-086 lifecycle only where a test owns the same canvas process. Preserve the hot-reload kept-state boundary and injection safety rather than simplifying the tests into in-process mocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-branch-compare, check-changes, check-doing, check-hot-reload, check-side-by-side, check-staleness, and check-version are replaced by typed native system tests grouped by public behavior.
- [ ] #2 Change-feed tests preserve ordering, cursor behavior, injection opt-in, loopback refusal, configured task routing, and the rule that an agent never receives its own injected drawing.
- [ ] #3 Doing and version tests preserve write-boundary narration requirements, real board versions, single stale refusal, actionable conflict output, and unchanged note bytes on refusal.
- [ ] #4 Hot-reload tests preserve kept state, deliberate canary failure, terminal and tab reporting, pane registrations, socket count, feed cursor, and the one unsaved-board exception.
- [ ] #5 Branch and side-by-side tests preserve board identity, variant routing, pane identity, operation order, exact compare results, and unchanged unrelated boards.
- [ ] #6 Owned canvas processes use the TASK-086 lifecycle; every test restores environment state and leaves no process, listener, socket, port, vault, or temporary branch on success or failure.
- [ ] #7 Every test source file is at most 500 lines and representative state-ordering, reload, stale-write, injection, and variant-routing regressions fail the native coverage before legacy deletion.
<!-- AC:END -->
