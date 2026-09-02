---
id: TASK-148.02
title: Remove unconditional one-write test sleeps
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-02 21:42'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 273000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One-write owners observe completion directly while preserving the exact wire-write count that protects atomic board mutations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Element-ops, snapshot, import-replace, and apply one-write owners replace their fixed 1 s, 80 ms, and 150 ms sleeps with observable completion.
- [ ] #2 Each changed owner retains its exact wire-write count and atomic outcome assertions.
- [ ] #3 Focused duration evidence shows timing sleeps are not used as success signals.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Run the four focused one-write owners to capture their current timing and verify the existing sleeps are the only delay-based success conditions.
2. Replace each delay with the response or feed, proxy record, and pane-frame observation that proves completion, preserving exact one-write and outcome checks.
3. Re-run the focused owners, audit cleanup and changed scope, then record evidence for parent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced all fixed waits with direct completion checks. Element operations now read the synchronous change feed immediately. Snapshot and import await the matching pane elements_changed frame. Apply routes the held agent request through the counting proxy and proves the proxy received exactly one request before releasing the hold, while the response remains pending.

Focused owner evidence: baseline 4/4 passed in 8.489 s (element ops 4.713 s); revised runs passed 4/4 in 5.675 s and 5.361 s (element ops 1.793 s and 1.707 s). Narrow lint, formatting, TypeScript checks, and git diff --check passed. Process audit found no owned canvas or counting-proxy child after the run.
<!-- SECTION:NOTES:END -->
