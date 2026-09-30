---
id: TASK-282
title: Choose useful column folds by completed pane fit
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 17:33'
updated_date: '2026-09-23 00:56'
labels: []
dependencies: []
type: bug
ordinal: 496000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cloud infrastructure baseline and Platform API Migration stay tall while Device mTLS Migration wraps. The early 5% estimate rejects the baseline despite a completed two-column solve improving fit by 10.5%; height-first partitioning also discards narrower useful splits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Column split selection accounts for width and height while preserving semantic containers.
- [x] #2 Approximate preflight geometry cannot reject the demonstrated useful fold; completed layouts retain the 5% acceptance gate.
- [x] #3 All three cloud shapes are verified for fit, containment, routes and labels, with focused regressions and the complete check gate passing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Retain useful width/height partition alternatives and remove unsafe early fit rejection. 2. Add focused geometry and rendered cloud regression coverage. 3. Measure the three live variants, run the complete gate, simplify and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The three live variants render at 1726x908, 1763x1123 and 2126x1154 with the working checkout settings, and all three were visually inspected in the rebuilt browser at 1920x1080. Separate pre-existing config edits (container inset and bend radius) cause unrelated module assertions to fail; full validation is being repeated in an isolated checkout with committed settings. Broadening candidate admission to width-limited diagrams regressed rendering time, so retain the existing height-bottleneck eligibility and remove only the unsafe predicted-fit rejection.

Final simplification keeps one layout path and the existing height-bottleneck eligibility. Only nondominated width/height prefixes survive; candidate count bounds use fixed leaf-card widths, and completed drawings retain the existing 5% gate. Isolated committed-config focused suites: 31/31 pass in 6.45s; system-map 527ms and flask-map-3 369ms. Isolated full check passes lint, formatting, types, frontend build and all module tests, but stops at the unrelated codex-pane-context realtimeStart delivery test; baseline comparison and remaining suites are pending.

Baseline proof: isolated codex-pane-context.test.ts fails identically when fold-columns.ts is restored to HEAD; final source was restored and hash-verified. Repository suite passes 8/8. Serial browser suite passes 12 cases then stops at codex-live-voice.test.ts realtime negotiation failure. No voice code or tests were modified. AC3 remains unchecked solely because the complete gate is blocked by these independent voice failures.

2026-09-23 re-render of the three cloud readings through semantic rasterize against the live vault (board version 45): Observed Infrastructure 1780x998, Device mTLS Migration 1817x1233, Platform API Migration 2182x1264. Inspected: containment intact, every label on its run, no route through a card, the IIS pool folded into one row of four. Gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Column split selection now keeps nondominated width/height partitions and no longer rejects a useful fold on predicted fit; completed layouts keep the 5% acceptance gate and height-bottleneck eligibility is unchanged. Verified with 31 focused renderer tests, inspected renders of all three cloud readings, and the full gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included).
<!-- SECTION:FINAL_SUMMARY:END -->
