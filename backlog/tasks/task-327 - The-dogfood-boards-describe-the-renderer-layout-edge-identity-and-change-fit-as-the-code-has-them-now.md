---
id: TASK-327
title: >-
  The dogfood boards describe the renderer layout, edge identity and change fit
  as the code has them now
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 01:48'
updated_date: '2026-09-24 09:15'
labels:
  - architecture
dependencies: []
priority: low
type: docs
ordinal: 562000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check on the dogfood vault (2026-09-24) warns about five bindings to files that refactors removed, so those nodes describe code that no longer exists: Renderer layout's Reading choice, Flank rules and Scorecard (removed when the renderer adopted Graphviz placement and native routing, 260ffd3f), Board persistence's Edge identity (e438c312, preserve continuing relationship IDs) and Board viewer's Fit what changed (777870b8, fit selected view when switching variants). Where each concern lives now has to be read from the source; the Renderer layout board may need its layout story redrawn, not only rebound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard check on the dogfood vault reports no missing binding
- [x] #2 Each of the five nodes is rebound to the code that does its job now, redrawn to match that code, or removed with its relationships and walkthrough references
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board persistence: Edge identity's refusal (edge-identity.ts) became write notices in replaced-relationships.ts, still called from editContent (edit-content.ts). Keep CxaaWj4x, rename to Replaced relationships, rebind, reword; relabel gkXKmHDc.
2. Board viewer: change-focus.ts was removed with no successor; a variant switch now fits the whole selected reading (use-auto-fit.ts). Remove Fit what changed (3eeEnf3E) with Hk1A9VKy and XssnNMPJ; no view or beat names them.
3. Renderer layout: ADR 0033 replaced ELK, direction choice, flank rules and the scorecard with Graphviz placement, a column fold kept only on better pane fit, and libavoid routing. Redraw the current variant: Reading choice continues as Column folds (fold-columns.ts); remove Flank rules and Scorecard with their edges; Layout engine becomes our engine.ts (createLayoutEngine) with Graphviz placement, Obstacle routing and the two external engines; fix stale Compound layout/Compound graph/Label reservations text; redraw the Inside the layout owner flow and the walkthrough beats that named the removed parts.
4. Rasterize each board and look; ./bin/dogfood check reports no BINDING_PATH_MISSING.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Board persistence v8: Edge identity (CxaaWj4x) renamed Replaced relationships and rebound to replaced-relationships.ts; e438c312 turned the edge-identity refusal into RELATIONSHIP_REPLACED/DUPLICATED write notices, still computed from editContent (edit-content.ts: notices: replacedRelationships(...)). gkXKmHDc relabelled.
Board viewer v8: Fit what changed (3eeEnf3E) removed with Hk1A9VKy and XssnNMPJ. 777870b8 deleted change-focus.ts and showChanges; a variant switch now fits the whole selected reading (use-auto-fit.ts), so nothing does its job. No view or beat named it.
Renderer layout v18 (current 8JVuwOvJ): redrawn for ADR 0033. Reading choice continues as Column folds (fold-columns.ts: foldColumnCounts called by compound.ts columnCounts, foldColumns called by engine.ts). Flank rules and Scorecard removed with tY9P0yad, kKBtoqI2, L8jPgkA5: the router owns face choice, and the only measure left is pane fit in compound.ts betterReading. Layout engine is now our engine.ts createLayoutEngine (was external elk-rs), calling Graphviz placement (graphviz-placement.ts placeGraph -> viz.renderJSON) and Obstacle routing (route-graph.ts routeGraph -> scene.router.processTransaction), with Graphviz and libavoid drawn as externals. Stale text fixed on Compound layout (no predecessor reuse, ADR 0032), Compound graph and Label reservations; flow Inside the layout owner and beats FWMgjXxD/AOPSXwkc redrawn.
./bin/dogfood check: 0 diagnostics.
Out of scope, not changed: the Semantic renderer board still says reading/flank rule/scorecard/ELK in Compound layout's description, an edge label and a beat.

Parent verification: ./bin/dogfood check reports configurationValid true and no diagnostics; semantic show confirms Replaced relationships (CxaaWj4x) is rebound and Fit what changed, Flank rules and Scorecard are gone from their boards; the rasterized Renderer layout board reads as Graphviz placement and obstacle routing under our Layout engine.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The five dogfood nodes that named deleted files now match the code: Edge identity became Replaced relationships, bound to replaced-relationships.ts; Fit what changed was removed with its edges; Renderer layout was redrawn for ADR 0033 (Column folds, our Layout engine calling Graphviz placement and Obstacle routing, Flank rules and Scorecard removed, flow and beats redrawn). Verified with ./bin/dogfood check (0 diagnostics), semantic show and a rasterized look at Renderer layout. The Semantic renderer board still describes reading/flank rule/scorecard/ELK and is left for a follow-up.
<!-- SECTION:FINAL_SUMMARY:END -->
