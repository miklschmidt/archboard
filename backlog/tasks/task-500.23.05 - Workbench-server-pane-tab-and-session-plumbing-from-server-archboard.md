---
id: TASK-500.23.05
title: 'Workbench server: pane, tab and session plumbing from server/archboard'
status: To Do
assignee: []
created_date: '2026-10-19 14:14'
labels: []
dependencies:
  - TASK-500.23.04
parent_task_id: TASK-500.23
ordinal: 898000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fifth move: the 15 server/archboard files that the workbench needs, listed in docs/design/package-map.md (pane-registry, tab-sessions, tab-canvas, pane-presentation, pane-board-key, semantic-change-feed, semantic-board-context, semantic-board-description, semantic-pane-context, request-board, request-vault, listener-address, transcript-changes, voice-start-trace, walkthrough-narration), and the session ownership, ordered teardown and cancellation files (lib/codex-workbench-sessions.ts, lib/codex-workbench-generation-lifecycle.ts, lib/codex-workbench-operation-lifecycle.ts). server/archboard is 40,000 lines; check each file's imports first, because a moved file cannot import what stays in server/archboard. Report a file that cannot move and the edge that blocks it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench/src/server holds those files in role folders with api files that the rest of server/archboard imports, and none of them is left in server/archboard
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
