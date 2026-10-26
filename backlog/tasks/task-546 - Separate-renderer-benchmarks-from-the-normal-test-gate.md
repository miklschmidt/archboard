---
id: TASK-546
title: Separate renderer benchmarks from the normal test gate
status: Done
assignee:
  - '@codex'
created_date: '2026-10-26T01:33:00Z'
updated_date: '2026-10-26T01:42:00Z'
labels: []
dependencies: []
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Normal development runs render the full tracked board corpus and enforce speed budgets. Developers need ordinary correctness tests without corpus benchmark cost.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The normal test gate excludes corpus-wide render and performance benchmark owners.
- [x] #2 A separate benchmark command runs the excluded owners without cached timing results.
- [x] #3 Test guidance explains corpus inputs and suite commands.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect normal owners and corpus inputs. Route benchmark owners through an explicit uncached command. Retain focused correctness tests and behavioral deadlines. Run the normal gate. No architecture boards change because test orchestration is outside their described runtime contracts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Normal bun run test passed all seven tasks including 19 browser owners. Focused bun run benchmark passed flask-map-1 on both engines, with 38 cases filtered and caching disabled. Lint passed with zero warnings. Touched files pass formatting and git diff --check. Full bun run check stops on pre-existing formatting errors in 60 third-party .agents/skills files. The corpus contains 20 inputs, producing 40 engine cases. Simplicity pass kept the existing exclusion pattern and added no runner. Runtime architecture boards remain accurate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the full renderer corpus and its speed gates out of normal module discovery into uncached bun run benchmark. Documented the board sources and retained focused correctness and cancellation contracts. Normal tests and focused benchmark execution pass. Full gate remains blocked by unrelated third-party skill formatting.
<!-- SECTION:FINAL_SUMMARY:END -->
