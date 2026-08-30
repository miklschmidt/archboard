---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-process
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the typed process manifest, dedicated homes, supported sign-in state, environment, lifecycle, and isolation in `src/runtime/codex-process`. This module returns a child handle and process snapshot; it does not own JSON-RPC framing or thread state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact configured 0.151.0 binary starts one stdio `app-server` child with the reviewed arguments, dedicated `CODEX_HOME`, dedicated requested `CODEX_SQLITE_HOME`, exact environment allowlist, exclusive home lock, and no Desktop/shared-daemon discovery.
- [ ] #2 After initialize, the module reads `configRequirements/read` and effective `config/read` where required and refuses readiness unless the effective SQLite home equals the manifest path, including a process test with a conflicting managed requirement.
- [ ] #3 Snapshots distinguish missing/wrong binary, sign-in required, locked home, starting, ready, crashing/backoff, stopping, and stopped; shutdown reaps the child and two dedicated homes remain isolated.
- [ ] #4 Supported account/login state is owned by the dedicated home; auth tokens or mutable config from the default Codex home are never borrowed or symlinked.
<!-- AC:END -->
