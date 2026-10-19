---
id: TASK-500.09
title: Codex transport and session are in the codex-app-server package
status: To Do
assignee: []
created_date: '2026-10-19 03:14'
labels: []
dependencies:
  - TASK-500.08
parent_task_id: TASK-500
ordinal: 874000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The last runtime part of codex-app-server: runtime/codex-transport (request settlement, the stdio frames, write capacity) and runtime/codex-session (initialization, identity, failure contracts). codex-semantic-context also belongs to this package in the map but imports board schemas by value, so it moves with the board package, after it exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex-transport and codex-session live in packages/codex-app-server in runtime/ role folders with the exports that outside code needs, every importer uses them, and the error classes, identity brands and session symbols keep one definition each
- [ ] #2 The tests of the moved code live in packages/codex-app-server/tests, and the opt-in write-capacity test path names its new location
- [ ] #3 The package imports nothing from src/ and only lower packages
- [ ] #4 bun run check passes
<!-- AC:END -->
