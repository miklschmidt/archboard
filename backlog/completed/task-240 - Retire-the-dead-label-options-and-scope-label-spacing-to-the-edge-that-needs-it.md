---
id: TASK-240
title: >-
  Retire the dead label options and scope label spacing to the edge that needs
  it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 21:27'
updated_date: '2026-09-15 21:55'
labels:
  - renderer
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - src/runtime/semantic-renderer/lib/layout/compound.ts
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
COMPOUND_OPTIONS sets edgeLabels.inline and centerLabelPlacementStrategy TAIL_LAYER, but labels are stripped from every edge ELK sees unless a retry reserved them, so both settings are dead. solveGraph also raises all three between-layer spacings to fit the tallest label on the page, so one long label loosens every layer. Delete or use the two options, and size the gap per edge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No ELK option is set that the graph ELK receives cannot exercise
- [ ] #2 A single tall label widens only the layer gap its edge crosses, measured on the three fixtures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scope the between-layer spacing to reserved labels and measure. 2. Check what the inline and TAIL_LAYER options reach.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both premises were wrong. Scoping the layer spacing to the labels ELK places starves the run pass: every label gets reserved one re-solve at a time and the fixture pages grow to 7.06/8.32/8.58 Mpx (wide-boards.test.ts caught it); reverted. inline and TAIL_LAYER apply to reserved labels, which a retry hands to ELK, so they are exercised. Recorded in docs/design/layout-rules.md rules 11 and 12.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
No change: the page-wide label spacing gives the runs their length and the two label options reach reserved labels; both findings recorded in the layout-rules map.
<!-- SECTION:FINAL_SUMMARY:END -->
