---
id: TASK-482
title: 'A board opens on its overview, and relationships and calls are drawn apart'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 21:04'
updated_date: '2026-10-17 02:07'
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
- [x] #1 Every subtask is done
- [x] #2 Every dogfood board passes `archboard check` without `OVERVIEW_CROWDED`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17: every subtask is Done; archboard check on this vault and on Docs-Architecture-Design reports no OVERVIEW_CROWDED.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Board overviews read: every crowded dogfood board has inner structure, its calls live in flows drawn by sequence and flowchart views, the overview is the reading a board opens on, and archboard check warns about crowded overviews and about a container that relates to a part inside it. Verified by the subtasks' own evidence and a clean archboard check on both vaults.
<!-- SECTION:FINAL_SUMMARY:END -->
