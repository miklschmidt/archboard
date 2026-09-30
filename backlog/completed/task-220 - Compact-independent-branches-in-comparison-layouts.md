---
id: TASK-220
title: Compact independent branches in comparison layouts
status: Done
assignee:
  - codex
created_date: '2026-09-15 02:15'
updated_date: '2026-09-15 02:29'
labels: []
dependencies: []
ordinal: 380000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Semantic renderer@Readable layout places Compound layout and its downstream block below Pretext even though both are independent children of Card measurement. Comparison position hints reserve an unnecessary row; fresh layout puts the siblings together. Preserve recognizability while avoiding needless vertical expansion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reported comparison places independent Pretext and Compound layout branches without an unnecessary sequential row, shortening the downstream block.
- [x] #2 Existing relative node order, containment, label clearance, and deterministic comparison behavior remain valid.
- [x] #3 A focused regression demonstrates the improvement and renderer validation plus manual board rendering verify it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Minimize the reported graph into a failing comparison-layout regression. 2. Correct new-branch layer hints while preserving stable node constraints; use ELK for final coordinates. 3. Verify broader comparison and routing tests, inspect the original board, simplify, and commit only this fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Aligned new terminal hints with their parent’s interpolated dependency step, then expanded insufficient hinted row gaps using measured label height and existing label-node clearance. ELK still owns final positions. Original comparison shrank from 1499px to 1348px, with Compound layout and Pretext together at y797; existing horizontal positions preserved. Raster inspected and all 18 labels clear of cards and unrelated routes. Regression fails when either correction is removed in an isolated baseline tree. Full check passed lint, formatting, types and build; module lane 3048 passed, 5 failed. Failures predate this correction under current unrelated font/palette edits: theme surfaces, raster pixels, two badge-routing assertions and data-flow label width. Canvas restarted with corrected source.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Independent comparison branches now share a row without label hints merging their layers. Verified original diagram 151px shorter with unchanged old horizontal positions and clear labels, plus a four-node regression covering both causes. Full gate reaches module tests with five pre-existing failures from concurrent font/palette changes.
<!-- SECTION:FINAL_SUMMARY:END -->
