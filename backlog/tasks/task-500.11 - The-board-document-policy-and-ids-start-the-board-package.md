---
id: TASK-500.11
title: 'The board document, policy and ids start the board package'
status: To Do
assignee: []
created_date: '2026-10-19 04:29'
labels: []
dependencies:
  - TASK-500.09
  - TASK-500.10
parent_task_id: TASK-500
ordinal: 876000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
board is layer 4 of docs/design/package-map.md: the board document and its one reader and writer. The shared half goes first because the browser uses it (shared/semantic-board is imported by 347 files): shared/semantic-board, shared/semantic-policy, shared/ids, shared/semantic-pane-context. It imports the binding, anchor and document-reference schemas from code-binding. Runtime/engine holds nothing the shared half needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/board holds the four shared modules in shared/ role folders with a few exports (document, policy, ids and pane context as the importers need them), no barrel, and every importer uses @archboard/board
- [ ] #2 Every export the browser reaches holds no node: import, proven by a trace from frontend and src/ui plus build:frontend
- [ ] #3 The tests of the moved code live in packages/board/tests, and ids stay defined once in the package (CLAUDE.md: no second site mints an id)
- [ ] #4 bun run check passes
<!-- AC:END -->
