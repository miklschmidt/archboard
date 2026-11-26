---
id: TASK-683
title: A presented walkthrough keeps the legend in its column
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-26T11:16:10Z'
labels:
  - frontend
dependencies: []
documentation:
  - DESIGN.md
ordinal: 1175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While a walkthrough is presented, its column takes the place of the right panel, and the panel's legend went with it, so a viewer of a presented step, or of its recording, had no key to the picture's marks. The owner asked first for a horizontal strip at the bottom of the screen, then chose the walkthrough column instead: a normal vertical legend at its bottom, before the talk buttons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A presented walkthrough's column shows the legend of the step's picture, with its part kinds, relationships and groups, directly above the Narrate key
- [ ] #2 The legend in the column only explains: it has no lens selector, no eye switch, no Show all, and a group tag presses nothing
- [ ] #3 The Narrate key and the step keys stay on screen at 1920 by 1080 however tall the step and the legend are, and what is above them scrolls
- [ ] #4 The legend of the right panel keeps its switches, lenses and group tags
- [ ] #5 DESIGN.md and the site's walkthrough player mock show the legend in the column
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Let ModelLegend take an optional controls bag; without it the rows render read-only.
2. ModelWalkthrough passes a read-only ModelLegend for the beat into SemanticPresentation through a legend slot.
3. SemanticPresentation splits the column into a scrolling region (rail, step, legend at its bottom) and a pinned foot (Narrate, keys).
4. Browser test in canonical-model-presentation, DESIGN.md, site mock.
<!-- SECTION:PLAN:END -->
