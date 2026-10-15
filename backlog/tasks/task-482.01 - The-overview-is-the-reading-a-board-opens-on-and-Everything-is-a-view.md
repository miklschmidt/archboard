---
id: TASK-482.01
title: 'The overview is the reading a board opens on, and Everything is a view'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 21:27'
labels:
  - renderer
  - semantic-model
  - ui
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: feature
ordinal: 842000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board opened on its whole variant, which on most dogfood boards is too many lines to read (ADR 0052). The overview is derived, so every board gets it without authoring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A render that names no view draws the overview: root parts and the parts directly inside each root container, every deeper container closed as a card
- [x] #2 A relationship to a hidden part is drawn to the closed card that holds it, all relationships from one drawn part to another are one line, a joined line has no label and takes the kind most of them have, and a relationship inside one closed card is not drawn
- [x] #3 The overview draws no flows, and it shows comparison marks on a proposal
- [x] #4 The view `Everything` draws every part and relationship, from the CLI, the HTTP route and the browser
- [x] #5 A write that names a view `Overview` or `Everything` is refused
- [x] #6 The browser opens a board on the overview, and the view list offers Overview, Everything and then the authored views
- [x] #7 The archboard skill and CONTEXT.md say what the overview and Everything are
- [x] #8 A walkthrough step that names no view is told through what the pane shows, and a step whose subject the overview hides says so
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derive the overview in src/shared/semantic-board/lib/scope.ts as a reading scope `{ kind: "overview" }`: root parts and their direct children drawn, deeper containers closed, relationships re-ended on drawn parts and joined per ordered pair, no flows.
2. Make it the reading of a render with no view (board.ts readingOf); add EVERYTHING_VIEW, found by findView, and let OfferedViewSchema carry its id.
3. Refuse authored views named Overview or Everything in board integrity, which runs on every read and write.
4. Offer Overview, Everything and the authored views in the browser view bar, always.
5. Keep a walkthrough step with no view on the pane view (the stage already says when a reading hides a subject).
6. Update CONTEXT.md, the skill, CLI descriptions, tests and the S09 eval fixture whose view was called Overview.
Boards: no board is affected. No board draws src/shared/semantic-board, and the other edits stay inside parts that Board viewer and Semantic renderer already draw.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dropped the planned rule that a step with no view is told through Everything when the pane shows the overview: it refetched a second picture whenever a walkthrough opened and broke nine narrative owners, while the stage already says when a reading hides a step subject. ADR 0052 and AC #8 were amended to match.

The S09 and S16 skill-eval fixtures and evals.json named a view Overview, which is now reserved; it is renamed Request path with the same selection, so the eval asks the same question.

Validation: bun run check passed lint, fmt and the module (4726 pass), system, and repository lanes; the browser lane failed only semantic-board-inspection, which opened a nested board expecting every level. It now opens with viewA=Everything and expects the restored view in the address; bun run test:serial-browser then passed 19/19. CLI smoke after restarting the server: semantic render "Live panes" draws the overview (25 parts, 69 lines; the board is flat), and --view Everything draws 25 parts and 71 lines.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board now opens on its overview (ADR 0052): the root parts and the parts directly inside each root container, deeper containers closed, relationships joined into one line per drawn pair, no flows. `Everything` is a view every board has, reachable from the CLI, the HTTP route and the browser view list, which now always offers Overview, Everything and the authored views. Views named Overview or Everything are refused. Verified with focused scope, coherence and proposal-drawing tests, the full module, system, repository and browser lanes, and a CLI render of Live panes in both readings.
<!-- SECTION:FINAL_SUMMARY:END -->
