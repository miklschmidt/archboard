---
id: TASK-245.08
title: >-
  Draw a first render under a few flank rules and keep the one the scorecard
  prefers
status: To Do
assignee: []
created_date: '2026-09-16 18:18'
updated_date: '2026-09-16 18:35'
labels: []
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/reading-choice.ts
  - src/runtime/semantic-renderer/tests/drawn-scorecard.ts
  - docs/design/layout-rules.md
parent_task_id: TASK-245
ordinal: 431000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every flank rule measured on 2026-09-16 wins on some boards and loses on others: forward skips left to the engine (today), skips on the left flank (before 1f370ce6), skips on the right with returns on the left, and returns on the left with no flank skips. Semantic renderer fits 0.61 today and 0.83 with skips on the left; flask-map-3 and Canvas server are best with returns on the left and no flank skips; Board viewer is best today. The user agreed to settle each candidate and keep the one that wins on the scorecard (fit, page area, card share, route length, bends, crossings, lane ink, flank fan), never on one measure, the same way the reading direction and the fold are already chosen. Whether to mirror the kept drawing across its vertical centre is a separate decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A first render settles each candidate flank rule and keeps the drawing that is better on more scorecard measures than each other candidate, with a documented tie-break
- [ ] #2 A proposal keeps its predecessor rule, like its reading direction, so a comparison does not jump between rules
- [ ] #3 The kept drawing never has a route through a card or a label off its run
- [ ] #4 docs/design/layout-rules.md records the candidates, the choice rule and the per-board result
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A flank rule names where returns travel and how forward skips attach: today (returns right, brackets left, other skips the engine's), skips on the left flank (before 1f370ce6), mirrored (returns left, skips right), returns left with every skip the engine's.
2. The rule travels with the problem into the graph builder: the return and beside flanks and whether skips are bracketed, flanked or free; port order on a swapped rule mirrors today's. Checks in the proposal code that only ask which side a face is on test the face, not the rule.
3. The drawing records its rule; a proposal settles in its predecessor's rule, as it does its reading.
4. A drawing-level scorecard in the renderer (fit, page area, card share, route length, bends, crossings, lane ink, flank fan; routes through cards as a veto) picks among the rules within each reading: the drawing better on more measures than each other, then most pairwise wins, then the earlier rule.
5. Measure every variant against the tree before; record section 21 in layout-rules.md; owner tests for the choice and for inheritance.
<!-- SECTION:PLAN:END -->
