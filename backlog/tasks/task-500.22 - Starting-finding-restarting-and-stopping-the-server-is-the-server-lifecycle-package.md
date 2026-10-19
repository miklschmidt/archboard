---
id: TASK-500.22
title: >-
  Starting, finding, restarting and stopping the server is the server-lifecycle
  package
status: To Do
assignee: []
created_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 891000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
server-lifecycle is layer 6: the rest of runtime/engine (panes, pidfile, restart, server-client, server-startup-cleanup, spawn, staleness, config, entry, types, package-version and their lib files), shared/server-startup-terminal and runtime/semantic-board-client. After the board and workspace moves nothing board-related is left in engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/server-lifecycle holds those files in role folders with api files, runtime/engine is gone, and every importer uses @archboard/server-lifecycle
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
