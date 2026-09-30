---
id: TASK-148.08
title: Scale board-inspection limit tests without production-sized work
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:22'
labels: []
dependencies: []
references:
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/schemas.ts
  - comparison-limits.test.ts
  - package-limits.test.ts
modified_files:
  - docs/agents/test-suite.md
  - src/runtime/board-inspection/diagnostics.ts
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/tests/comparison-limits.test.ts
  - src/runtime/board-inspection/tests/fixtures/limit-cases.ts
  - src/shared/timing/timing.ts
  - tests/system/board-inspection/fixtures/package-limit-cases.ts
  - tests/system/board-inspection/package-limits.test.ts
parent_task_id: TASK-148
ordinal: 280000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers need the 2,000,000-comparison production ceiling preserved without spending about 41 seconds performing 2,000,001 comparisons four times. Make the detector ceiling injectable internally with a production default of 2,000,000; run behavioral matrices at a small representative ceiling near 2,000; keep one cheap assertion that pins the production default and shipped schemas.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Production behavior and public schemas still use exactly 2,000,000 unless an internal test seam explicitly supplies another ceiling.
- [x] #2 Limit/exceeded/completed-findings behavior is covered once per distinct contract using a representative small ceiling, without duplicating the production-sized loop through module and package lanes.
- [x] #3 The focused owners complete near one second on this host and report before/after elapsed time without weakening strict exit or schema behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an optional comparison ceiling only to the internal detector and diagnostics path, defaulting every production call to BROAD_PHASE_COMPARISON_LIMIT.
2. Rewrite the module comparison owner around a representative 2,000-comparison ceiling, covering the boundary stop, retained completed findings, deterministic results, and the fixed public literal/schema without production-sized work.
3. Remove the duplicate package-binary comparison-magnitude case and its fixture builders while retaining the package input-limit strict/non-strict, text, and schema contract.
4. Run only the two exact focused owners in separate bounded transient services, verify each unit is inactive with no descendants, record elapsed evidence, and commit the scoped source, tests, and Backlog update.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the detector-only comparisonLimit seam with the production default unchanged at BROAD_PHASE_COMPARISON_LIMIT = 2_000_000. The module owner now uses a 2,000-comparison matrix for below-limit, attempted comparison 2,001, deterministic findings, public schema literals, and completed zero-length findings. Removed the duplicate package comparison traversal and generated fixture data while retaining the real package input-limit strict/non-strict, JSON schema, and text-rendering contract. Removed the two now-unused 40s/90s timing constants and updated the test-suite inventory.

Accepted before evidence: roughly 41 seconds for four production-sized traversals. Final focused evidence: `bun test src/runtime/board-inspection/tests/comparison-limits.test.ts` passed 3 tests in 84ms, transient service runtime 103ms; `bun test tests/system/board-inspection/package-limits.test.ts` passed 1 test in 442ms, transient service runtime 473ms. Combined service runtime: 576ms. Each unit reported inactive afterward and its cgroup no longer existed. Frozen dependency materialization took 162ms, and package.json/bun.lock hashes remained unchanged.

Review remediation after maintenance rebase e7453ec1 -> 3731a8b9: moved the representative comparison-budget probe behind the module-root diagnostics.ts entrypoint, so comparison-limits.test.ts no longer imports private lib modules and the production inspectBoard API remains unchanged. Removed the unused terminalComparisonBoard parameters and kept 20 nodes, 60 connectors, and 20 labels inside the fixture. Focused rerun: comparison-limits passed 3 tests in 110ms, service runtime 140ms; package-limits passed 1 test in 451ms, service runtime 468ms. Both transient units reported inactive and had no remaining cgroup.

Direct integration audit: cherry-picked reviewed source commits f46e0b8cfb34837da1c475ebe70bb4ff22002ad8 -> 447b344dab9f80ea9fe3f882f94de1d552140bb5 and c741564e49cd71147b9bc0f741d4eec787f93705 -> f8c2b5a5070e43e9f6ade9ec7487669e2b6957f4 from fixed base 67ef2d21af1ce8a234eda94866f4197e7eacf6a5. Independent Standards and Spec reviews were REVIEW_CLEAN. Static range inspection confirms the production default and public literals remain 2,000,000 while only diagnostics inject 2,000. Recorded focused verification: comparison-limits 3 passed in 110ms (140ms contained service); package-limits 1 passed in 451ms (468ms contained service); combined contained runtime under one second, down from about 41 seconds. The recorded runs reported no process residue.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preserved the 2,000,000 production/public comparison ceiling while moving the limit behavior matrix to an internal 2,000-comparison diagnostics seam and removing duplicate package-scale traversal. Verified by independent clean reviews, static integration inspection, and recorded focused owners: 3 comparison tests in 110ms and 1 package test in 451ms (under one second combined service runtime, versus about 41 seconds before).
<!-- SECTION:FINAL_SUMMARY:END -->
