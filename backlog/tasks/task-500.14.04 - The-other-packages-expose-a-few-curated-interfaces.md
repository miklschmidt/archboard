---
id: TASK-500.14.04
title: The other packages expose a few curated interfaces
status: To Do
assignee: []
created_date: '2026-10-19 09:18'
labels: []
dependencies:
  - TASK-500.14.03
parent_task_id: TASK-500.14
ordinal: 883000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex-app-server 17, workspace 10, code-binding 9, process 6, diagnostics 4, timing 2 subpaths. Apply the same rule as board: a public file curates only the names outside code imports, merges subpaths that are one capability, and keeps the rest private. Ask Codex to propose the grouping for each package from its importers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each package lists its public interface in docs/agents/boundaries.md as the operations callers need, and the subpath count per package is lower than today with no export used by only one file unless it is a deliberate seam
- [ ] #2 bun run check passes
<!-- AC:END -->
