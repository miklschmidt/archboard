---
id: TASK-245.05
title: Try ELK model order in place of hand-seeded lanes for proposal continuity
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
updated_date: '2026-09-16 09:59'
labels: []
dependencies:
  - TASK-245.04
references:
  - src/runtime/semantic-renderer/lib/layout/compound-predecessor.ts
  - src/runtime/semantic-renderer/lib/layout/compound-node-hints.ts
  - docs/design/measured-compound-renderer.md
parent_task_id: TASK-245
priority: medium
type: spike
ordinal: 428000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Continuity across variants (ADR 0023: a proposal keeps its predecessor's arrangement) is implemented by seeding ELK with INTERACTIVE strategies, pinned card positions, port offsets escalating to FIXED_POS, seeded routes, hand-placed lanes for new cards and badge room beside inherited corridors: compound-predecessor.ts, compound-node-hints.ts, compound-flanks.ts and compound-label-space.ts, 1,227 lines, most of them incident-driven (layout-rules.md section 4 item 7). ELK's layered algorithm offers model order (elk.layered.considerModelOrder.strategy NODES_AND_EDGES, crossingMinimization.forceNodeModelOrder, INTERACTIVE layering keyed on the predecessor's layers) as the supported way to keep an arrangement stable without coordinates. This is an experiment with a decision at the end: land it if it keeps the continuity tests and the fit, otherwise record the measurement and keep the seeding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A measured comparison on the vault's proposals (Canvas server, Renderer layout, Semantic renderer) and on each fixture with one synthetic edit, reporting card displacement against the predecessor, fit, bends and route ink for the current seeding and for model order, is recorded in docs/design/layout-rules.md
- [x] #2 Either model order replaces the seeding, with compound-node-hints.ts, compound-flanks.ts and compound-label-space.ts deleted and the predecessor-layout, predecessor-routing, new-card-placement, comparison-labels, comparison-approach and standing tests passing (re-derived where they pinned seeding geometry), or the note records why it lost and the seeding stays
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Behind a temporary switch, replace seedPredecessor with ELK model order: children sorted by the predecessor's placement (layer along the reading, then across; new cards after their nearest neighbour by id), edges in the predecessor's order, considerModelOrder NODES_AND_EDGES with forceNodeModelOrder, no pinned positions or seeded routes.
2. Measure on the vault's three proposals and a one-skip edit of each fixture: mean card displacement against the predecessor's first render, fit, bends per route, route ink, routes through cards, for the seeding and for model order.
3. Run the continuity tests (predecessor-layout, predecessor-routing, new-card-placement, comparison-labels, comparison-approach, standing) under model order.
4. Decide: land only if continuity and fit hold with the four seeding modules deleted; otherwise record the numbers in layout-rules.md section 16 and keep the seeding.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spike measured and rejected. Model order (children sorted by predecessor placement along then across the reading, edges by predecessor order, considerModelOrder NODES_AND_EDGES, forceNodeModelOrder, no seeding) on the vault's three proposals and a one-skip edit of each fixture: mean card move against the predecessor's first render 141->584, 88->397, 66->615 on the fixture edits and 59->239 on Semantic renderer; a route through a card on two fixture edits; flask-map-3 fit 0.42->0.33. It fails four continuity tests (new-card-placement x3, predecessor-routing flank column). It wins bends and ink only on the smaller proposals by re-laying them. The seeding stays; the spike code was removed. Table in layout-rules.md section 16.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measured ELK model order against the hand seeding on the vault's three proposals and a one-skip edit of each fixture, recording fit, card displacement, bends, route ink and routes through cards in layout-rules.md section 16. Model order moved surviving cards four to nine times as far, crossed cards on two edits, lost fit on flask-map-3 and failed four continuity tests, so it was rejected and the seeding stays; no source change lands. Verified by the measurement script and the continuity tests run under the spike switch, then the renderer suite on the restored tree.
<!-- SECTION:FINAL_SUMMARY:END -->
