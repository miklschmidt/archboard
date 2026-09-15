---
id: TASK-240
title: >-
  Retire the dead label options and scope label spacing to the edge that needs
  it
status: To Do
assignee: []
created_date: '2026-09-15 21:27'
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
