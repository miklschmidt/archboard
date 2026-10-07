---
id: TASK-436.12
title: 'Remove cliSurface, commandHelp and cliSurfaceOf'
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 706000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`cliSurface` and `commandHelp` in `src/cli/commands/run.ts`, and `cliSurfaceOf` in `src/cli/command-routing/lib/registry.ts`, have no caller outside each other. The tests read the command table through `cliContractRegistry`, but `docs/agents/test-suite.md` still names `cliSurface()`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The three functions are gone, and `docs/agents/test-suite.md` names what the system tests use
<!-- AC:END -->
