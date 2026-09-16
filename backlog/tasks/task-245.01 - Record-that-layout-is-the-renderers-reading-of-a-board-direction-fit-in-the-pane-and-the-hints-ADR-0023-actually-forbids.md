---
id: TASK-245.01
title: >-
  Record that layout is the renderer's reading of a board: direction, fit in the
  pane, and the hints ADR 0023 actually forbids
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:35'
labels: []
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - CONTEXT.md
  - src/runtime/semantic-renderer/lib/layout/rank.ts
  - src/runtime/semantic-renderer/index.ts
parent_task_id: TASK-245
priority: high
type: docs
ordinal: 424000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0023 still says PR Lens's layout was chosen for its clarity and finish; the compound layout of 2026-09-13 replaced it with ELK and renderer-owned reading conventions, and later fixes re-decided pieces of the layout model one board at a time with nothing on record. The ADR also says fitting one viewport is not a success criterion and forbids a density policy, while tests/wide-boards.test.ts already enforces page bounds. And the renderer reads the ADR's no-hints line more strictly than the ADR's own list: rank.ts says a rank hint is a coordinate in disguise and index.ts says no coordinate, no colour and no rank hint, while the ADR forbids coordinates, font sizes, colours and connector routes and allows containment, ordered flows, focal subjects and grammar (a flow's participant order is already accepted presentation intent). A future agent reading the ADR rules out what TASK-245 asks for. Write the decision before the implementation so the sibling subtasks work under it. The domain-modeling skill holds the ADR and CONTEXT.md conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An accepted ADR (an amendment to 0023 or a new one that supersedes the relevant paragraphs) states that the architecture layout is ELK with renderer-owned reading conventions rather than PR Lens's grid; that a view's reading direction is the renderer's decision, derived from the board and never authored; that a layout change is measured by how the drawing fits the reference pane (about 1272 by 952 diagram units, derived from the desktop shell) together with reader invariants, replacing the 'not a success criterion' and 'no density policy' clauses; and that what agents may not author is exactly the ADR's list, so presentation intent already on the board is not an exception
- [ ] #2 CONTEXT.md defines reading direction, fit and reference pane with their avoid-lists, and the rank.ts and index.ts headers cite the ADR instead of a stricter paraphrase
- [ ] #3 ADR 0023's Relationship and Delivery sections link the new decision
<!-- AC:END -->
