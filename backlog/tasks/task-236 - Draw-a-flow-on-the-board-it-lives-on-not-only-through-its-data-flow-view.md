---
id: TASK-236
title: 'Draw a flow on the board it lives on, not only through its data-flow view'
status: To Do
assignee: []
created_date: '2026-09-15 19:18'
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
- [ ] #1 The architecture reading of a variant draws each flow step between two distinct participants as a line when no authored relationship joins those nodes in that direction; a self step draws nothing
- [ ] #2 A drawn step line is visibly distinct from an authored relationship and carries the step id, so selecting it selects the step and a comparison badges it as the step's standing
- [ ] #3 An authored relationship between the same nodes in the same direction suppresses the step line, so a board with both does not draw two lines for one call
- [ ] #4 Renderer tests cover a flow-only board, a board with both, and a self step; the S07 baseline captures rendered again show the exchange on the whole-board picture
<!-- AC:END -->
