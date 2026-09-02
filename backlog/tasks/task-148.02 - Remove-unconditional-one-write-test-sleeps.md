---
id: TASK-148.02
title: Remove unconditional one-write test sleeps
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-02 21:47'
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

4. Close the review-found proxy arrival race with a bounded record probe, then assert the same exact request and body remain the sole write after hold release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Element operations read GET /api/changes immediately after each completed write; the route returns the settled feed synchronously. Snapshot and import await the matching pane elements_changed frame before inspecting pane messages. Apply routes the held agent request through the counting proxy, uses the bounded waitFor probe until the exact POST method, path, and query are recorded, proves the response remains unanswered before release, then proves after release that the proxy recorded exactly one non-read request with the original request body.

Focused owner evidence: baseline before timing removal passed 4/4 in 8.489 s (element ops 4.713 s). The final review-amended range passed 4/4 in 5.631 s (element ops 1.831 s). No fixed sleep remains in the four owners. Narrow formatting, lint, both TypeScript projects, and git diff checks passed.
<!-- SECTION:NOTES:END -->
