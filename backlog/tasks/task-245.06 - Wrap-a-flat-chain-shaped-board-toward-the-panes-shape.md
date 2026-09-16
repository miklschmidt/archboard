---
id: TASK-245.06
title: Wrap a flat chain-shaped board toward the pane's shape
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
updated_date: '2026-09-16 10:06'
labels: []
dependencies:
  - TASK-245.03
references:
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - docs/design/layout-rules.md
parent_task_id: TASK-245
priority: medium
type: enhancement
ordinal: 429000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pipeline read left to right is a ribbon: Semantic renderer 3952x460, Command interface 2890x276. ELK's layered wrapping (elk.layered.wrapping.strategy MULTI_EDGE with elk.aspectRatio) folds a long chain like lines of text. Measured 2026-09-16 at aspect 1.32 it brought Command interface to 1225x690 (fit 1.0, three lines of a pipeline) and Semantic renderer to 2134x1105 (fit 0.60, bends 3.3 per edge from the wrap-around returns); it throws on any board with a frame (TypeError: nodeOrder[l][0].layer inside the engine) and loses badly on the dense fixtures (flask-map-1 8.0 Mpx, 4.6 bends per edge). So it is a tool for flat chain-shaped boards, gated on the measure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wrapping is applied only when it raises the fit in the reference pane and keeps bends per edge within the wide-board bound, and never to a board with a frame; the decision is deterministic and recorded on the drawing like the direction
- [ ] #2 The engine's failure with a frame is caught and named in a test so an engine upgrade that fixes it is noticed
- [x] #3 Command interface renders as a wrapped pipeline at fit 1.0, Semantic renderer does not lose fit against the direction subtask's result, labels remain on their own routes and returns keep the flank convention
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A first render of a board with no frame also settles a wrapped reading in each direction (elk.layered.wrapping.strategy MULTI_EDGE, elk.aspectRatio the reference pane's shape in the solving frame); an engine throw drops that candidate.
2. A wrapped candidate is eligible only with bends per route within the wide-board bound; the kept drawing is the highest fit, ties preferring down, then unwrapped. The drawing records wrapped beside direction; a proposal inherits both; the SVG root carries data-reading-wrapped.
3. A test calls the engine directly with a frame and wrapping and names its failure, so an upgrade that fixes it is noticed.
4. Measure every board and fixture; land only if Command interface wraps at fit 1.0, Semantic renderer does not lose fit and the reader invariants hold; otherwise record and reject in layout-rules.md section 17.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed with SINGLE_EDGE wrapping. First renders of frameless boards also settle a folded reading per direction (aspect = the reference pane's shape in the solving frame); a folded candidate needs the engine to succeed, bends per route <= 3 and at most one route across its folds; best fit wins, ties to down then unfolded; a proposal inherits direction and fold; data-reading-wrapped on the SVG root, wrapped on the drawing. Result: Command interface 683x1027 fit 0.88 -> 1012x805 fit 1.00 (two columns, one fold route); every other board and fixture unchanged. Measured and rejected: folding left to right (loses everywhere: Command interface 0.79, Semantic renderer 0.38); MULTI_EDGE (Command interface 0.98, Semantic renderer 0.75 but with four routes looping round the whole page in the rasterised picture, and it throws property.getDefault inside the engine on flask-map-2); fold targets narrower than the pane (1.0, 1.2 lose). The one-route gate came from looking at the rasterised Semantic renderer fold. AC2 not met as written: the frame failure (nodeOrder[l][0].layer) does not reproduce in this transposed solve, and the engine cuts no framed vault board, so frames are excluded by rule; the engine failure that does occur (MULTI_EDGE, property.getDefault) is caught in the candidate and held by engine-wrapping.test.ts against the captured graph (wrapping-failure.json), which also asserts SINGLE_EDGE succeeds on it. Tests: reading-direction (a 12-stage chain folds at fit 1 with no card crossed and labels on runs; a framed chain never folds; a proposal keeps the fold), wide-boards floor for Command interface raised to 1.0. Validation: renderer suite 191 pass, lint:policy on src, lint:baseline, fmt:check, type-check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A frameless board's first render now also tries folded readings (ELK single-edge wrapping toward the reference pane's shape) and keeps one only when it raises fit, stays within the bend bound and carries at most one route across a fold; the fold is recorded on the drawing and SVG and inherited by proposals. Command interface now renders as a two-column pipeline at fit 1.00 (from 0.88); every other board and fixture is unchanged and all reader invariants hold. Folding left to right, MULTI_EDGE (loops round the page, and throws on flask-map-2) and narrower fold targets were measured and rejected (layout-rules.md section 17). AC2 is not met as written: the frame failure does not reproduce here, so the test instead names the engine failure that does (MULTI_EDGE on a captured real graph). Verified with the fold and engine tests, the renderer suite, both lint configurations, fmt:check and type-check.
<!-- SECTION:FINAL_SUMMARY:END -->
