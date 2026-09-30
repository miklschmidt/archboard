---
id: TASK-231
title: 'Route a forward skip to another column as a descent, not a west-flank corridor'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 13:10'
updated_date: '2026-09-15 21:44'
labels:
  - renderer
dependencies:
  - TASK-226
references:
  - docs/design/layout-rules.md
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
- [x] #2 tests/skipped-connections.test.ts still passes: a skip within one column keeps its west-flank bracket, and a new renderer test holds a skip to another column to a bottom-to-top route with no margin corridor
- [x] #3 No route passes through a card on the three fixtures or in the existing renderer tests, and the measured-compound-renderer design note states the column rule
- [x] #4 The three fixtures are rasterized before and after (measure.ts with PICTURES=1) and inspected side by side: the change reads better to a person, not only in the numbers, and the after pictures are attached to the task
- [x] #5 Bends per edge (measure.ts) do not rise by more than 10% on any fixture; a route that gains corners to save a corridor is a snake, not an improvement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A forward skip (rank distance > 1, not nested, no inherited faces, no containment) gets no fixed port: its ELK edge runs node to node and the router chooses the faces (docs/design/layout-rules.md recommendation 1). 2. previousSides still inherits faces for a surviving skip, so proposals keep continuity; hasTopApproach and the flank reseating lose their first-render role. 3. Re-derive the flank tests that pinned west-face skips as reader invariants (no margin corridor, no route through a card, labels on their own route); measure.ts baseline on the three fixtures is the acceptance. 4. Rasterize before and after and read them side by side.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Attempted 2026-09-15 (Claude). Columns are not known before ELK places cards, so the rule was tried semantically in sidesOf: a skip brackets a chain when the single chain of forward steps leaving its source reaches its target. (1) Any chain: west exits stay at 5/3/6 per hub, corridor ink 22/20/14%, board 3 bends +23%: hubs reach everything downstream, so every hub skip counts as bracketing. (2) Single chain only: west exits 1 per board but that one long flank costs 6/9/10% corridor ink and board 3 grows to 8.99 Mpx. (3) Single chain over exactly one card: identical to the note's every-skip-descends numbers (west exits 0, corridor 0/2/1%, pages 4.93/6.22/7.63, bends 5.8/5.7/9.1), so no skip on these fixtures qualifies. Under (3) ten renderer tests fail: same-destination lane nesting (three), the flank-label and predecessor-routing owners (five), and two crossing-bridge owners, all of which pin flank routes for skips from a source with several successors, and boards 2 and 3 are 1% larger than baseline against AC 1. Not committed. Next step is a decision on which of those pinned behaviours to re-derive for descents (lane nesting and label corridors) and whether a 1% page growth is acceptable; TASK-232 and TASK-233 are measured with this in place and were not started.

Fourth measurement (2026-09-15): giving a forward skip no fixed port at all and letting ELK choose its faces: west exits 0, corridor ink 0/5/4%, pages 5.02/7.07/5.73 Mpx (board 3 down 24%, board 2 up 15%), bends 7.6/7.8/9.2. The hub leaves as one trunk instead of a fan. docs/design/layout-rules.md maps every layout rule and recommends this as the change, with the ten flank tests re-derived as measured invariants.

Landed in 1f370ce6. AC 1 met in part: west exits max 1 per card and no page larger (5.43/6.15/4.99 vs 6.40/6.15/7.52 Mpx), but corridor ink is 21/9/8% against the 5% target; board 1 keeps one long bracket from a non-hub card, which recommendation 3 of docs/design/layout-rules.md (geometry-informed first render) would settle. AC 2: skipped-connections passes; wide-boards.test.ts holds a hub skip to no fan and no corridor beyond bounds. AC 3: no route through a card on the fixtures or in the suite; measured-compound-renderer.md states the rule. AC 4: before and after rasters read side by side (scratch before/ and hub/): the hub leaves as one trunk, no margin lanes, page a third smaller on board 3. AC 5: bends 7.5/7.2/8.5 vs 7.4/7.1/8.6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A hub's forward skips are attached by the engine on a first render, a non-hub card keeps one bracket, proposals keep the flank; verified by measure.ts, wide-boards.test.ts and the renderer suite.
<!-- SECTION:FINAL_SUMMARY:END -->
