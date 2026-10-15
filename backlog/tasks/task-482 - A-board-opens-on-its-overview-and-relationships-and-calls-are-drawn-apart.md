---
id: TASK-482
title: 'A board opens on its overview, and relationships and calls are drawn apart'
status: To Do
assignee: []
created_date: '2026-10-15 21:04'
labels:
  - renderer
  - semantic-model
  - skill
  - ui
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
priority: high
type: feature
ordinal: 841000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-15 the owner found the whole drawing of Live panes (25 cards, 71 lines) incomprehensible. 12 of the 17 dogfood boards draw more than 40 lines whole, and the same boards take 5 to 40 s to lay out with the blocks engine. Every dogfood board is flat (all parts directly in one container), and most relationships are calls (Live panes: 47 of 71). ADR 0052 records the decision: a board opens on a derived overview, Everything is a view, the overview has a budget that `archboard check` holds, and calls belong in flows. Ungrouping a board is authoring work that agents do board by board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is done
- [ ] #2 Every dogfood board passes `archboard check` without `OVERVIEW_CROWDED`
<!-- AC:END -->
