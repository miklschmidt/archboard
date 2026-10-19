---
id: TASK-500.22
title: >-
  Starting, finding, restarting and stopping the server is the server-lifecycle
  package
status: Done
assignee: []
created_date: '2026-10-19 11:10'
updated_date: '2026-10-19 14:17'
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
- [x] #1 packages/server-lifecycle holds those files in role folders with api files, runtime/engine is gone, and every importer uses @archboard/server-lifecycle
- [x] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the 23 files of runtime/engine, shared/server-startup-terminal and runtime/semantic-board-client into packages/server-lifecycle/src/runtime/{services,store,operations,clients,state,protocol,rules}, tests into tests/runtime/. 2. Rewrite every outside importer by (module, name) to 9 curated runtime/api files (config, server, server-host, server-client, request-context, semantic-board-client, panes, pane-messages, startup-terminal). 3. Replace depth-dependent paths (package.json version, src/server.ts spawn target, staleness roots) with SOURCE_CHECKOUT. 4. Update ci.yml, package-api ADOPTERS, boundaries/package-map/test-suite docs. 5. Verify tsc, lint, package tests, policy tests, fresh-process loads, cycles, bun run check, and a real status/restart/status from the worktree.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
server-lifecycle holds the server start, find, restart, stop, pane and board-client code in runtime role folders with nine curated api files (71 names); runtime/engine, shared/server-startup-terminal and runtime/semantic-board-client are gone. Codex reviewed d68e91b8c with no material findings. bun run check exited 0, and a restart/stop cycle was run from the worktree server.
<!-- SECTION:FINAL_SUMMARY:END -->
