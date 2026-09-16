---
id: TASK-245.09
title: Bring an architecture render back under 150 ms
status: To Do
assignee: []
created_date: '2026-09-16 19:30'
labels:
  - renderer
  - performance
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/compound.ts
  - src/runtime/semantic-renderer/lib/layout/label-reservations.ts
  - docs/design/wide-board-layout-fixtures/measure.ts
parent_task_id: TASK-245
ordinal: 433000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rendering one variant went from about 100 ms to nearly a second on 2026-09-16 (warm engine, first render): Semantic renderer Current architecture 112 ms before TASK-245.07, 617 ms after it, 928 ms after TASK-245.08; Canvas server 93, 347, 748 ms. Releasing unused label reservations re-solves the board once per release attempt, and choosing a flank rule settles three more drawings. The server also lays out every predecessor of a proposal before the proposal itself. The canvas shows its loading skeleton on a first draw for that long, and the user asked for a performance loop back to sensible times, ideally under 150 ms, without giving back the layout gains those subtasks measured on the scorecard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A render of the current variant of every vault board and of each wide-board fixture, engine warm, takes under 150 ms, measured by a repeatable timing script whose numbers are recorded in docs/design/layout-rules.md
- [ ] #2 No board or fixture is worse on the scorecard than on the tree before the optimization on more measures than it is better, or the trade is recorded with the user
- [ ] #3 bun run check passes
<!-- AC:END -->
