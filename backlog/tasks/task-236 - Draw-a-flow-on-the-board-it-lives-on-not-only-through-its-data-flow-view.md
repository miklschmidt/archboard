---
id: TASK-236
title: 'Draw a flow on the board it lives on, not only through its data-flow view'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 19:18'
updated_date: '2026-09-15 19:28'
labels:
  - renderer
dependencies: []
references:
  - .skill-evals/2026-09-15T13-56-41-652Z/runs/candidate/S07/1/captures
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - src/runtime/semantic-renderer/index.ts
  - TASK-235
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A sequence board whose author wrote a flow and no edges renders, in the whole-board architecture reading, as unjoined cards: the 2026-09-15 batch S07 candidate captures show five cards and nothing between them, while the same board reads perfectly through its data-flow view. The flow is drawn only through that view. The board is what a reader opens first, so a board holding an exchange should show it. ADR 0023 says the grammar is the view's stated intent, never derived from content, so the fix is inside the architecture grammar: a flow step between two distinct participants is a message with a line of source evidence, and the architecture reading can draw it as a line when no authored relationship already joins those two nodes in that direction, distinguishable from an authored relationship (dashed, labelled by the step) and carrying the step id so selection and comparison still resolve. Alternative considered: choosing the data-flow grammar for a whole-board reading when the variant has flows and no edges; rejected because it derives the grammar from content. The skill now tells authors to write the calls as edges as well (TASK-235.02), so this is the renderer half.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The architecture reading of a variant draws each flow step between two distinct participants as a line when no authored relationship joins those nodes in that direction; a self step draws nothing
- [x] #2 A drawn step line is visibly distinct from an authored relationship and carries the step id, so selecting it selects the step and a comparison badges it as the step's standing
- [x] #3 An authored relationship between the same nodes in the same direction suppresses the step line, so a board with both does not draw two lines for one call
- [x] #4 Renderer tests cover a flow-only board, a board with both, and a self step; the S07 baseline captures rendered again show the exchange on the whole-board picture
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. withStepLines derives one line per flow message between distinct participants not covered by an authored relationship. 2. renderArchitecture applies it to the content and its predecessors; paintArchitecture paints derived ids as step subjects, dashed and open-headed. 3. Tests in step-lines.test.ts; visual check on the S07 candidate board from the batch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rendered the S07 candidate rep 1 board from the 2026-09-15 batch through the library and rasterized it (scratch s07.png, 690x725): Shell -> FlaskGroup -> run_command -> ScriptInfo -> run_command -> run_simple drawn as dashed step lines with labels, the self step absent. Renderer 158 pass, server and canvas suites 536 pass, lint and type-check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The architecture reading draws flow steps as distinct step lines where no relationship joins the parts; verified by step-lines.test.ts and a rasterized S07 board.
<!-- SECTION:FINAL_SUMMARY:END -->
