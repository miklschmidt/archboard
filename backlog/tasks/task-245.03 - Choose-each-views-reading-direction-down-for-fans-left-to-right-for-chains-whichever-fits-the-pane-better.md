---
id: TASK-245.03
title: >-
  Choose each view's reading direction: down for fans, left to right for chains,
  whichever fits the pane better
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
updated_date: '2026-09-16 09:44'
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
- [x] #1 The layout expresses its conventions in reading terms (forward out, forward in, return, containment) with one mapping to compass faces per direction, and no compass literal remains outside that mapping
- [x] #2 A first render solves both directions and keeps the one with the higher fit in the reference pane, ties going down the page; the choice is deterministic and recorded on the drawing so the atlas, the measure script and tests can read it
- [x] #3 A proposal rendered against a predecessor keeps the predecessor's direction
- [ ] #4 On the vault's current boards Semantic renderer, Command interface, Board viewer and Codex session read left to right and Command dispatch, Archboard and Board persistence read down, and no board or fixture fits worse than the recorded baseline
- [x] #5 Labels sit on runs in both directions, and the room between layers is derived from the label dimension that lies across the layers
- [x] #6 Renderer tests that pinned rows or faces are re-derived as direction-neutral reader invariants; the data-flow grammar is unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. lib/layout/reading.ts: ReadingDirection (down | right); the solving frame's faces in reading terms (forward out, forward in, return flank, beside flank, and the frame's header side); one mapping from solving faces to page faces per direction (down: identity; right: transposed); face geometry helpers; transposition of points, boxes, curves, measured sizes and drawings. Every board is solved in one frame; a board read left to right is the transposed problem solved and transposed back, so the predecessor path stays direction-neutral by construction (ELK's own DOWN is a transposition of its horizontal frame, so this is the same layout the sandbox measured with elk.direction RIGHT).
2. drawing.ts: ArchitectureDrawing carries its direction; index.ts exposes readingDirection on RenderedDiagram and the SVG root carries data-reading-direction.
3. compound-graph.ts: conventions through reading.ts (no compass literal outside it); the frame's header side decides containment faces, the frame padding and boundary crossings.
4. compound.ts: a first render settles both directions and keeps the higher fit in the reference pane, ties down; a proposal inherits its predecessor's direction; leaveFromTitle and label obstacles follow the header side.
5. The predecessor path (compound-predecessor, compound-node-hints, compound-flanks) names its faces through reading.ts.
6. drawn-ink.ts reads the direction for corridor and flank measurements; measure.ts prints it; tests that pinned rows or faces re-derived through a reading helper; a direction test (choice, tie, inheritance, attribute).
7. Measure every board; layout-rules.md section 14 records what changed and what the chain boards do under a plain rotation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as one solving frame plus transposition (lib/layout/reading.ts): a left-to-right board is its transposed measured sizes solved in the down frame and transposed back, which is what ELK's own RIGHT does internally, so the predecessor path stays direction-neutral. Conventions are SOLVING.forwardOut/forwardIn/returnFlank/besideFlank plus the frame's header side; no compass literal remains outside reading.ts. Two decisions were forced: a frame's title band stays at the page top, so in the transposed frame it is on the frame's left (padding, label obstacles, leaveFromTitle and boundary crossings follow it); and a frame's own relationship runs along the reading (forwardIn/forwardOut), because a flank port on a frame crashed the engine's node placer (nodeReps[other.id_0].tail on Codex session), which is also why boundary crossings under the transposed frame take the frame's foot. A first render settles both directions and keeps the higher fit, ties down; a proposal keeps its predecessor's direction; drawing.direction, RenderedDiagram.readingDirection and data-reading-direction record it. AC5 holds by construction: solveGraph sizes the gap between layers from the label dimension in the solving frame, which is the page width of a label under a rightward reading; a labelled 16-leaf fan reads right with every label on its own run. AC4 NOT met: measured on every fixture and vault board, a rightward reading loses fit on all fourteen (Semantic renderer 0.61 down vs 0.29 right, Command interface 0.88 vs 0.39, Board viewer 0.62 vs 0.27, Codex session 0.91 vs 0.42), so every board still reads down and no fit changed. Sizing between-layer room by the label's short side reproduced the sandbox's pages and still lost everywhere (Command dispatch nearest, 0.79 vs 0.88); reverted. The chain boards reading left to right depends on folding the ribbon (TASK-245.06), and the sandbox's wrapped numbers (Board viewer 0.53, Semantic renderer 0.60) suggest even that will not beat down on Board viewer, and wrapping throws on Codex session's frames. Recorded in layout-rules.md section 14. Tests re-derived through tests/drawn-reading.ts (along, across, faceOf ahead/behind/beside/return): architecture (loose nodes, chain), predecessor-layout, comparison-approach, new-card-placement, containment-calls (plus a left-to-right frame case), skipped-connections, route-nesting; drawn-ink measures corridor and flank fan along the reading. Validation: 185 renderer tests pass, 569 across renderer/UI/server modules, type-check, lint:policy on src, lint:baseline, fmt:check.

bun run check passes on commit 0538225c with FORCE_COLOR unset (all lanes, browser included). With the job environment's FORCE_COLOR=3, tests/system/cli/resource-cleanup.test.ts fails four cases on ANSI escapes in error text; they pass with colour off and are unrelated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each architecture view now has a reading direction chosen by the renderer: a first render is settled down and left to right in one solving frame (the rightward one transposed) and the higher fit in the reference pane is kept, ties down; a proposal keeps its predecessor's direction; the choice is on the drawing, the render result and the SVG root. All face conventions are stated in reading terms in lib/layout/reading.ts, frames keep their title at the page top in both readings, and the renderer tests that pinned rows or faces are re-derived as direction-neutral invariants. Not met: AC4. Measured on all fourteen boards and fixtures, left to right loses fit on every one (Semantic renderer 0.29 vs 0.61, Command interface 0.39 vs 0.88), so every board still reads down and fits are unchanged; the chain boards reading left to right is left to the wrapping experiment (TASK-245.06), recorded in layout-rules.md section 14. Verified with the reading-direction owner, the renderer suite (185 pass), module suites, type-check, both lint configurations and fmt:check.
<!-- SECTION:FINAL_SUMMARY:END -->
