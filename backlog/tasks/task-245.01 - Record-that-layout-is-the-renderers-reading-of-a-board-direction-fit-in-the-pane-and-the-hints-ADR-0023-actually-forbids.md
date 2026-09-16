---
id: TASK-245.01
title: >-
  Record that layout is the renderer's reading of a board: direction, fit in the
  pane, and the hints ADR 0023 actually forbids
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:35'
updated_date: '2026-09-16 02:41'
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
- [x] #1 An accepted ADR (an amendment to 0023 or a new one that supersedes the relevant paragraphs) states that the architecture layout is ELK with renderer-owned reading conventions rather than PR Lens's grid; that a view's reading direction is the renderer's decision, derived from the board and never authored; that a layout change is measured by how the drawing fits the reference pane (about 1272 by 952 diagram units, derived from the desktop shell) together with reader invariants, replacing the 'not a success criterion' and 'no density policy' clauses; and that what agents may not author is exactly the ADR's list, so presentation intent already on the board is not an exception
- [x] #2 CONTEXT.md defines reading direction, fit and reference pane with their avoid-lists, and the rank.ts and index.ts headers cite the ADR instead of a stricter paraphrase
- [x] #3 ADR 0023's Relationship and Delivery sections link the new decision
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write docs/adr/0028 (accepted) superseding ADR 0023's layout paragraphs: ELK with renderer-owned reading conventions replaces PR Lens's grid; a view's reading direction is the renderer's decision derived from the board, never authored; a layout change is measured by fit in the reference pane (about 1272 by 952 diagram units, derived from the desktop shell) plus reader invariants, replacing the 'not a success criterion' and 'no density policy' clauses; what agents may not author is exactly ADR 0023's list (coordinates, font sizes, colours, connector routes), so presentation intent already on the board (containment, ordered flows, focal subjects, grammar) is not an exception.
2. Add reading direction, fit and reference pane to CONTEXT.md with avoid-lists (no implementation detail).
3. Link the new decision from ADR 0023's Relationship and Delivery sections.
4. Make rank.ts and index.ts headers cite the ADR's list instead of the stricter 'no rank hint' paraphrase.
5. bun run fmt:check on the touched files; commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR 0028 written as accepted, superseding ADR 0023's PR Lens layout sentence and its 'not a success criterion' / 'no density policy' clauses; ADR 0023's Relationship and Delivery sections link it. CONTEXT.md gained a Reading section (reading direction, reference pane, fit) with avoid-lists. rank.ts and index.ts headers cite ADR 0023's list and ADR 0028 instead of the 'no rank hint' paraphrase. oxfmt --check passes on the five files; the rank test passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the layout decision before implementing it: docs/adr/0028 (accepted) states the layout is ELK with renderer-owned reading conventions, a view's reading direction is derived and never authored, fit in the reference pane (about 1272 by 952, derived from the desktop shell) plus reader invariants is the measure, and the no-author list is exactly ADR 0023's four items. CONTEXT.md defines reading direction, reference pane and fit; ADR 0023 links the new decision from Relationship and Delivery; rank.ts and index.ts cite the ADR. Verified by grep of each clause, oxfmt --check and the rank test.
<!-- SECTION:FINAL_SUMMARY:END -->
