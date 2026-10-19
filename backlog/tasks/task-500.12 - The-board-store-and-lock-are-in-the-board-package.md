---
id: TASK-500.12
title: The board store and lock are in the board package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 04:29'
updated_date: '2026-10-19 04:58'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move into packages/board/src/runtime: all of runtime/semantic-board-store (index.ts barrel of 87 lines, 44 lib files, 29 tests) and, from runtime/engine, board.ts, board-doing.ts, board-catalogue.ts, board-target.ts, board-lock.ts and lib/board-address.ts, lib/board-lock-*.ts (acquisition, claim-state, claims, contracts, migration, state). Role folders from the doc: store (files, locks, registries, file formats, migrations), operations (one write or read a caller asks for: edit, move, rename, settle, adopt, discard, restore, shelve, propagate, batch, read, listing). The lock goes in store/ (lock) and stays private unless an outside caller imports it; split a folder past about 12 files by behavior (operations/edit, operations/move, ...).
2. semantic-board-store/index.ts is a forwarding barrel: delete it and point importers at the defining files as in the board shared task (unbarrel script /tmp/pm/board/unbarrel.ts is the example; compare exported names; no schema or class defined twice, no cycle inside the package).
3. exports: the minimum used outside. Make the five store-only shared exports private (integrity, positions, primitives, reconcile-candidate, reconcile) once the store is inside, unless an outside file still imports one. Report the export count before and after.
4. Every write still goes through @archboard/workspace/atomic-write and commits before it answers; the board lock and the invariants in CLAUDE.md stay. The persistence tests (lock lease, claims, announcements, vaults) move with the lock and must pass unchanged in behavior.
5. runtime/engine then holds no board file; grep to prove. The package imports only lower packages and nothing from src/. Check depth-dependent paths (import.meta.url) and fix them.
6. Tests move to packages/board/tests/runtime/<role>/ with support under tests/runtime/support/. Update ci.yml, evals/coverage.json, vite.config.ts, docs, skills and boundaries.md (add that board is complete and name which exports became private). bun run check.
<!-- SECTION:PLAN:END -->
