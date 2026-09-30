---
id: TASK-109
title: >-
  Simplification pass over the architecture refactor (TASK-101 to TASK-108):
  reuse, simplification, efficiency, altitude
status: Done
assignee:
  - '@claude'
created_date: '2026-08-23 19:34'
updated_date: '2026-08-23 20:05'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A four-angle review (reuse, simplification, efficiency, altitude) of `git diff b24eaf0..ccc9049` — the commits that landed TASK-101 (change-reporting reducer), TASK-103 (board version), TASK-104 (element input conversion), TASK-102 (board write door), TASK-106 (refusals carry the board), TASK-105 (naming sweep), TASK-107/108 (metadata reader, check-labels) — found the findings recorded on the two subtasks, split by file ownership so they can be fixed in parallel: the frontend half (reducer, hook, api.ts, its headless check) and the server/core half. None is a correctness bug; each is duplicated, wasted, dead, or a special case layered on the new shared mechanism. Fix without changing intended behaviour; every check keeps asserting what it asserts today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both subtasks are Done and `bun run test` passes on the combined tree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both halves Done: TASK-109.01 fixed every frontend finding (test:reporting grew 38 -> 54); TASK-109.02 fixed all but E5/E6, skipped with reason (binding indexes would need an ordering-sensitive converter refactor beyond a behaviour-preserving pass). Combined tree verified by the maintainer: bun run test exit 0, all 26 suites including test:browser (zero diff), test:typing and test:live-session (42/42 cycles agreed).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The simplification review's findings across the TASK-101..108 refactor are remediated in both halves: dead and derivable reducer surface removed, the mermaid path routed through the reducer, pane server calls centralised in api.ts, writeBoard's request reduced to source/save?/mutation/answer, the double clone and lost fast paths restored, refusals recognised by shape, one element-input schema, 27 catch tails collapsed. Verified with the full bun run test chain (exit 0) on the combined tree.
<!-- SECTION:FINAL_SUMMARY:END -->
