---
id: TASK-233
title: Layer and compact wide boards so cards fill the page
status: To Do
assignee: []
created_date: '2026-09-15 13:10'
updated_date: '2026-09-15 18:52'
labels:
  - renderer
dependencies:
  - TASK-226
  - TASK-231
references:
  - docs/design/wide-board-layout.md
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
priority: medium
type: bug
ordinal: 393000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/wide-board-layout.md measures the three Flask module maps in docs/design/wide-board-layout-fixtures: LONGEST_PATH_SOURCE layering gives nine rows to fifteen cards, most rows hold one or two cards, and node placement spreads them across the width the corridors demand, so cards cover 7% to 10% of the page and only 16% to 22% of 100 px cells touch a card (a detached column of six cards on one board, an empty upper right and middle left on another). Network-simplex layering alone brought the rows to seven or eight and the page down 6% to 17%; post-compaction with network-simplex placement changed little on its own; together with skip descents (TASK-231) they reached 29% of cells touched and pages 34% to 38% smaller on two boards, while the third kept its size because its corridors returned. The stages interact, so this task is measured with TASK-231 in place and must not undo it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Margin-corridor ink stays at or under 5% on all three fixtures, so the compaction does not bring the corridors back
- [ ] #2 The renderer test suites and the server proposal-drawing tests pass, and predecessor placement (cards keeping their rows and columns across a proposal) is unchanged by the new layering options
- [ ] #3 The three fixtures are rasterized before and after (measure.ts with PICTURES=1) and inspected side by side: the change reads better to a person, not only in the numbers, and the after pictures are attached to the task
- [ ] #4 Bends per edge (measure.ts) do not rise by more than 10% on any fixture; a route that gains corners to save a corridor is a snake, not an improvement
- [ ] #5 On each of the three fixtures, with TASK-231 merged, measure.ts baseline reports at least 30% of 100 px cells touching a card and a page area at most 70% of the baseline recorded in the note (6.40, 6.15 and 7.52 Mpx)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-15 18:52
---
The 2026-09-15 skill-eval batch (S14 candidate, 20 parts and 37-43 edges) scored readability 4/10 in both arms: the grader called the render a thicket of long routed lines, labels floating far from their edges and eight parallel lines fanning out of the WSGI application card. Captures under .skill-evals/2026-09-15T13-56-41-652Z/runs/candidate/S14/*/captures are a fourth fixture to measure against.
---
<!-- COMMENTS:END -->
