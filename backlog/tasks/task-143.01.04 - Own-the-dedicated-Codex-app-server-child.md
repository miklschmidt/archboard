---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:39'
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
Own the typed process manifest, dedicated homes, environment, lifecycle, locking, and isolation in `src/runtime/codex-process`. This module resolves and starts the child and returns a child handle plus process snapshot; initialization, account state, JSON-RPC, and thread state belong to later modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact configured 0.151.0 binary starts one stdio app-server child with reviewed arguments, dedicated CODEX_HOME, dedicated requested CODEX_SQLITE_HOME, exact environment allowlist, exclusive home lock, and no Desktop/shared-daemon discovery.
- [ ] #2 Snapshots distinguish missing/wrong binary, locked home, spawning, running, crashing/backoff, stopping, and stopped without claiming protocol, configuration, account, or session readiness.
- [ ] #3 Shutdown, spawn failure, signal exit, and backoff release locks and reap the child; two process owners prove dedicated homes and locks remain isolated.
- [ ] #4 Process tests cover binary resolution, exact argv/env, lock contention, exponential bounded backoff, SIGTERM then bounded kill, orphan refusal, and no borrowed or symlinked default Codex state.
<!-- AC:END -->
