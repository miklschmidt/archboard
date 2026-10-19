---
id: TASK-500.13
title: The semantic context is in the codex-app-server package
status: To Do
assignee: []
created_date: '2026-10-19 04:29'
labels: []
dependencies:
  - TASK-500.12
parent_task_id: TASK-500
ordinal: 878000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/codex-semantic-context (3,441 lines) belongs to codex-app-server in the map but imports board schemas by value (normalize-architecture.ts), so it waited for the board package. It moves in now, with the exports its importers need.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex-semantic-context lives in packages/codex-app-server in runtime/ role folders, every importer uses the package exports, and the package imports board only through @archboard/board
- [ ] #2 The tests of the moved code live in packages/codex-app-server/tests, and the package graph test passes (codex-app-server is layer 5, board layer 4)
- [ ] #3 bun run check passes
<!-- AC:END -->
