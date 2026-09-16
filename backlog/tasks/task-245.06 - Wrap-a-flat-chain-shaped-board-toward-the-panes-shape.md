---
id: TASK-245.06
title: Wrap a flat chain-shaped board toward the pane's shape
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
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
- [ ] #1 Wrapping is applied only when it raises the fit in the reference pane and keeps bends per edge within the wide-board bound, and never to a board with a frame; the decision is deterministic and recorded on the drawing like the direction
- [ ] #2 The engine's failure with a frame is caught and named in a test so an engine upgrade that fixes it is noticed
- [ ] #3 Command interface renders as a wrapped pipeline at fit 1.0, Semantic renderer does not lose fit against the direction subtask's result, labels remain on their own routes and returns keep the flank convention
<!-- AC:END -->
