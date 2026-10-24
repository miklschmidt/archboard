---
id: TASK-519
title: Keep Board viewer Track layout within its existing timing contract
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24 12:17'
updated_date: '2026-10-24 12:47'
labels: []
dependencies: []
references:
  - packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts
priority: high
type: bug
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517.01 full gate recorded Board viewer Track layout at 3082.46 ms against its existing limit below 3000 ms. Two focused reproductions reached 3902.23 ms and 3886.03 ms with CI unset. Sampling found repeated station-map scans and meetsAt work during route crossing comparisons. The repair must improve measured execution without changing layout choices or the timing limit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The existing Board viewer Track owner passes its unchanged timing and picture-correctness assertions.
- [x] #2 The optimization preserves route choices and refreshes any prepared endpoint data when accepted routes move stations.
- [x] #3 Focused renderer owners and the complete normal gate pass without threshold or assertion changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected. The route-search mechanism and its drawn responsibility stay the same.
1. Use the reproduced Board viewer Track owner as the unchanged timing and picture-correctness signal.
2. Prepare other chains endpoint data once per route search, then refresh it for each later search.
3. Compare route choices and all existing crossing and layout owners before and after the change.
4. Measure the focused owner with competing browser validation stopped. Do not change thresholds, assertions, or test environment.
5. Simplify the result and commit the fix with Refs: TASK-519.
6. Require the complete normal gate before marking this repair done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renderer repair committed as e77643cbeed538c0f0d45c5cad72129a96ada174. The unchanged normal-environment Board viewer Track owner passed at 2944.31 ms, 2955.06 ms after extraction, and 2938.28 ms final. Earlier focused baselines were 3902.23 and 3886.03 ms, with a fresh same-slot baseline of 3648.66 ms. All six solver result JSON documents remained byte-identical. All 263 relevant tests passed with 47730 assertions. Both type projects, lint, formatting, and whitespace checks passed. No thresholds, assertions, clocks, or policies changed. Full gate remains pending. Evidence: /tmp/task519-correctness-final.log and /tmp/task519-wide-final-3.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed repeated preparation and crossing work in Track routing. The focused owner passed at 2938.28 ms with unchanged assertions. All six measured solver outputs remained byte-identical. The complete gate passed, with Board viewer Track at 2227.62 ms. Evidence: e77643cbe and /tmp/task517.01-check-repaired.log.
<!-- SECTION:FINAL_SUMMARY:END -->
