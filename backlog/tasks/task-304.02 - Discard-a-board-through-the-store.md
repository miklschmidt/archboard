---
id: TASK-304.02
title: Discard a board through the store
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
labels:
  - cli
  - runtime
dependencies: []
parent_task_id: TASK-304
ordinal: 532000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board made only to be recorded should not stay in the vault. No path deletes a board today: semantic-board-store has only write transitions. Deleting goes through the store, like every write, so it takes the one-writer lease and is refused when somebody else holds the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The store deletes a board note under the board's lease with a stated doing, and a board somebody else claims is refused and the holder is named
- [ ] #2 A loopback route and the semantic board client expose it; a missing board is refused as missing
- [ ] #3 Panes and the catalogue learn the board is gone the way they learn of any other change to the vault
<!-- AC:END -->
