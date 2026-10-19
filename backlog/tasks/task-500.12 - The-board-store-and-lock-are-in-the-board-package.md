---
id: TASK-500.12
title: The board store and lock are in the board package
status: To Do
assignee: []
created_date: '2026-10-19 04:29'
labels: []
dependencies:
  - TASK-500.11
parent_task_id: TASK-500
ordinal: 877000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The runtime half of board: runtime/semantic-board-store (10,055 lines, the one place a board file is read or written) and from runtime/engine the board lock and its lib files, board, board-doing, board-catalogue, board-target and lib/board-address. board-lock stays private to the package unless an outside caller needs it. This ends the board and server-lifecycle import cycle in runtime/engine. Every write still goes through the atomic write of workspace and commits before it answers (CLAUDE.md invariants).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The store and the engine board files live in packages/board in runtime/ role folders with exports for what outside code uses (store, lock, address as needed), no forwarding barrel, and every importer uses @archboard/board
- [ ] #2 runtime/engine holds no board file any more, and the package imports only lower packages and nothing from src/
- [ ] #3 The tests of the moved code live in packages/board/tests, and the persistence tests (atomic write, lock lease, claims) still pass unchanged in behavior
- [ ] #4 bun run check passes
<!-- AC:END -->
