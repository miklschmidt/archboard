---
id: TASK-148.02
title: Remove unconditional one-write test sleeps
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-02 21:51'
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
- [x] #1 Element-ops, snapshot, import-replace, and apply one-write owners replace their fixed 1 s, 80 ms, and 150 ms sleeps with observable completion.
- [x] #2 Each changed owner retains its exact wire-write count and atomic outcome assertions.
- [x] #3 Focused duration evidence shows timing sleeps are not used as success signals.
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

Integrated validation on codex/task-143-144-workbench: bun test tests/system/process-contracts/element-ops-one-write.test.ts tests/system/process-contracts/snapshot-one-write.test.ts tests/system/process-contracts/import-replace-one-write.test.ts tests/system/process-contracts/apply-one-write.test.ts passed 4/4 in 5.21 s with 183 assertions. The run proves direct completion observations preserve the exact wire-write and atomic-outcome contracts. git diff --check db534cae19e0bae18916d0801915c5509c3080e2..HEAD passed. Both independent reviews were clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed fixed timing sleeps from the four one-write owners. Completion now waits for the actual feed, pane frame, or counted proxy request while retaining exact one-write and atomic-outcome assertions. Verified by the integrated four-owner run, 4/4 passing in 5.21 s with 183 assertions, plus a clean whitespace check and two clean independent reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
