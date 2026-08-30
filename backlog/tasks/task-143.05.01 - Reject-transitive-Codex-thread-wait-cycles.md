---
id: TASK-143.05.01
title: Reject transitive Codex thread wait cycles
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-wait-graph
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the pure lifetime-scoped wait-for graph in `src/runtime/codex-wait-graph`. It receives child/caller/turn/call and target identities and decides whether a dynamic operation may wait.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adding an edge set succeeds only when the resulting directed graph is acyclic and otherwise returns the exact inspectable cycle path.
- [ ] #2 Direct self-wait, two-node, three-node, and longer transitive cycles are refused before any app-server dispatch.
- [ ] #3 Settle, decline, cancellation, interruption, disconnect, and child exit remove only the owned edges; module tests prove no stale edge or cross-child collision.
<!-- AC:END -->
