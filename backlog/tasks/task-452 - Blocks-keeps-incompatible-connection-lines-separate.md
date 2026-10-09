---
id: TASK-452
title: Blocks keeps incompatible connection lines separate
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-09 10:33'
updated_date: '2026-10-09 10:48'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 803000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers see Blocks join lines with different relationship kinds or traffic directions. Preserve each connection meaning when routes share a corridor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Different relationship kinds remain distinct along rendered Blocks routes.
- [ ] #2 Connections with incompatible traffic directions do not join along rendered Blocks routes.
- [ ] #3 Compatible connections can still share a line, and focused regression tests exercise the reported failure.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use the reported Auditlog Timestamp Integrity board to reproduce the overlap. Keep an anonymized renderer fixture and test both different-kind and same-kind opposing routes. Separate unrelated facing port columns during existing port settlement, within the allowed span, while retaining directly connected and shared ports. Run renderer tests, the complete repository gate, and the live board. No board proposal is needed: Renderer layout and Semantic renderer retain the same parts, calls, and responsibilities; the change stays inside port settlement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduction: EF Core read and GET auditlog endpoints share 10 diagram units on the reported board. The reduced fixture shares 24.25 units, for both http/data and data/data. The native trunk router fixes the end segments. Nudging them also moves their pins, so the fix separates unrelated facing ports before routing. The existing nearestFree span calculation selects a column inside the allowed span. All 544 renderer tests passed before the helper extraction; the 13 focused tests passed after it. Existing kind tests retain compatible shared ports. The renderer promise and authoring contract stay unchanged, so consumer skill and evaluation inputs need no change.
<!-- SECTION:NOTES:END -->
