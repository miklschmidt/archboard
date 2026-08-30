---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.01.16
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
Own one dedicated Codex 0.151.0 stdio child, exact environment/config construction, effective storage roots, stderr drainage, restart policy, and process shutdown. The child never attaches to Desktop or a shared daemon. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before spawn, the host creates restrictive dedicated CODEX_HOME and CODEX_SQLITE_HOME directories and atomically writes CODEX_HOME/config.toml with exactly sqlite_home = the quoted canonical absolute SQLite root; permissions, ownership, escaping, symlinks, and pre-existing conflicting config fail closed.
- [ ] #2 The exact argv is the configured absolute codex binary followed by app-server, --stdio, --strict-config; version is proven as 0.151.0 and no daemon, proxy, listen, websocket, analytics-default, code-mode-host, or Desktop MCP argument is accepted.
- [ ] #3 The documented environment allowlist is constructed, then dedicated CODEX_HOME/CODEX_SQLITE_HOME overwrite it and all ambient CODEX_*, OPENAI_*, AWS credential/profile, listener/auth, daemon, and Desktop variables are stripped; supported credentials enter only through typed login RPCs.
- [ ] #4 stderr drains continuously into bounded diagnostics; missing/wrong binary, config write/fsync/rename failure, locked/unwritable/colliding roots, strict-config rejection, early exit, crash, backoff, TERM/KILL, and stopped state are deterministic with no orphan.
<!-- AC:END -->
