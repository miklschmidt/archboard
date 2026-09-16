---
id: TASK-245.03
title: >-
  Choose each view's reading direction: down for fans, left to right for chains,
  whichever fits the pane better
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
labels: []
dependencies:
  - TASK-245.02
references:
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - src/runtime/semantic-renderer/lib/layout/compound.ts
  - src/runtime/semantic-renderer/lib/layout/label-runs.ts
  - src/runtime/semantic-renderer/lib/layout/jogs.ts
  - docs/design/layout-rules.md
parent_task_id: TASK-245
priority: high
type: enhancement
ordinal: 426000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
elk.direction is DOWN in one line of compound-graph.ts and the face rules are compass literals (SOUTH to NORTH for a step, EAST for a return, WEST for a bracket, NORTH and SOUTH for containment), so a chain of seven modules is a column even though a pipeline reads left to right and the pane is landscape. Measured 2026-09-16 with every face rotated with the direction: Semantic renderer 997x1468 (fit 0.65) became 3952x460 (0.32) as a plain rotation and 2134x1105 (0.60) wrapped; Command interface 683x1027 (0.93) became 1225x690 (1.0) wrapped; Command dispatch, a fan, stays better down (0.88 against 0.79). So the direction is chosen per view, and a plain rotation is not enough on its own (the wrapping subtask covers the rest). Things that assume the vertical axis and must become direction-aware: solveGraph raises the between-layer spacing by label height, and under RIGHT the gap between layers has to hold label width; leaveFromTitle and straightenJogs assume vertical legs; label-runs and the corridor measurement treat vertical runs specially; the frame title band stays at the top in both directions, so containment faces are decided rather than rotated blindly. A proposal must keep its predecessor's direction or the comparison and the shared-element transition (TASK-234) lose the reader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The layout expresses its conventions in reading terms (forward out, forward in, return, containment) with one mapping to compass faces per direction, and no compass literal remains outside that mapping
- [ ] #2 A first render solves both directions and keeps the one with the higher fit in the reference pane, ties going down the page; the choice is deterministic and recorded on the drawing so the atlas, the measure script and tests can read it
- [ ] #3 A proposal rendered against a predecessor keeps the predecessor's direction
- [ ] #4 On the vault's current boards Semantic renderer, Command interface, Board viewer and Codex session read left to right and Command dispatch, Archboard and Board persistence read down, and no board or fixture fits worse than the recorded baseline
- [ ] #5 Labels sit on runs in both directions, and the room between layers is derived from the label dimension that lies across the layers
- [ ] #6 Renderer tests that pinned rows or faces are re-derived as direction-neutral reader invariants; the data-flow grammar is unchanged
<!-- AC:END -->
