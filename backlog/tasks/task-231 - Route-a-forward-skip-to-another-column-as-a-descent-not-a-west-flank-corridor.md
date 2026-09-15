---
id: TASK-231
title: 'Route a forward skip to another column as a descent, not a west-flank corridor'
status: To Do
assignee: []
created_date: '2026-09-15 13:10'
updated_date: '2026-09-15 13:23'
labels:
  - renderer
dependencies:
  - TASK-226
references:
  - docs/design/wide-board-layout.md
  - docs/design/wide-board-layout-fixtures/measure.ts
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
priority: high
type: bug
ordinal: 391000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/wide-board-layout.md measures the three Flask module maps in docs/design/wide-board-layout-fixtures: a forward relationship spanning more than one rank leaves the source by its west face and enters the target by its west face (sidesOf in src/runtime/semantic-renderer/lib/layout/compound-graph.ts), so a hub with six skips gets six lanes down the left margin, 19% to 33% of the route ink runs in margin corridors, and the approach along the target row is where labels land. The west flank is right for a skip inside one column, the bracket beside a chain that tests/skipped-connections.test.ts holds, and wrong for a skip to a card in another column, where it manufactures a corridor. Routing every skip as a descent removed the corridors on all three fixtures (0% to 2% of ink) and cut two pages by 10% to 25%, but grew the third, so the change is to route by column, not a blanket switch. Nothing here changes labels or card distribution; those are TASK-232 and TASK-233, and the three are measured together with measure.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On each of the three fixtures, measure.ts baseline reports at most 2 west exits from any one card and margin-corridor ink at or under 5%, and no page larger than its current baseline area
- [ ] #2 tests/skipped-connections.test.ts still passes: a skip within one column keeps its west-flank bracket, and a new renderer test holds a skip to another column to a bottom-to-top route with no margin corridor
- [ ] #3 No route passes through a card on the three fixtures or in the existing renderer tests, and the measured-compound-renderer design note states the column rule
- [ ] #4 The three fixtures are rasterized before and after (measure.ts with PICTURES=1) and inspected side by side: the change reads better to a person, not only in the numbers, and the after pictures are attached to the task
- [ ] #5 Bends per edge (measure.ts) do not rise by more than 10% on any fixture; a route that gains corners to save a corridor is a snake, not an improvement
<!-- AC:END -->
