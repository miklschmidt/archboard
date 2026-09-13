---
id: TASK-192
title: Restore named variants in the board sidebar
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 00:16'
updated_date: '2026-09-13 00:27'
labels: []
dependencies: []
ordinal: 351000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The semantic-board listing endpoint returns only board name/key and board-catalog/listing.ts hard-codes variant current, so Navigator lists a current leaf for every board and hides proposals/history. User cannot navigate variants from the sidebar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sidebar lists persisted named variants under each board, with current designation and proposals/history distinguishable.
- [x] #2 Selecting a variant opens the exact variant and active-pane indication agrees, including the canonical current address.
- [x] #3 Focused behavior checks, full repository gate and live frontend verification pass without weakening lint/types.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace listing/navigation contracts and reproduce missing variants. 2. Supply variant summaries from the canonical store listing and map them into existing navigation. 3. Verify named selection and current addressing through focused tests. 4. Build/restart final source, inspect browser sidebar, run full gate with server stable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restored persisted variant summaries through the existing listing and catalog. Current remains the bare board address; draft/history rows use exact IDs, with name/current alias normalization for selected and pane markers. Verified catalog 5/5, endpoint lifecycle 6/6, focused lint/types/format, build, and full bun run check exit 0. Live browser verified Initial and Readable layout rows, exact draft navigation to @8JVuwOvJ, canonical current navigation, and moving pane A marker. Final simplification retains the existing query/cache and board-wide activity; views model unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored real variant names and lifecycle badges in the board sidebar, including exact proposal navigation and matching active-pane markers. Verified focused behavior tests, live frontend interactions after build/restart, and complete bun run check (exit 0).
<!-- SECTION:FINAL_SUMMARY:END -->
