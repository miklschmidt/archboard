---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 22:52'
labels: []
dependencies:
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
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
- [ ] #3 The child environment is built from empty using exactly the retained keys and order frozen in the authored contract, then canonical CODEX_HOME and CODEX_SQLITE_HOME overwrite ambient values; a poisoned-environment fixture asserts the exact output key set, byte-preserved values, absent optional keys, NUL rejection, and no fallthrough.
- [ ] #4 stderr drains continuously into bounded diagnostics; missing/wrong binary, config write/fsync/rename failure, locked/unwritable/colliding roots, strict-config rejection, early exit, crash, backoff, TERM/KILL, and stopped state are deterministic with no orphan.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed private-child contract with current process, filesystem, atomic-write, timing, and exact Codex 0.151.0 executable conventions.
2. Build one deep codex-process module that prepares restrictive dedicated storage, writes the exact strict config atomically, constructs the closed ordered environment and argv, and exposes a typed lifecycle without module-scope state.
3. Exercise every reachable startup, stderr, crash/backoff, TERM/KILL, storage/config refusal, and cleanup state through owned process tests with real subprocess fixtures and no orphaned children.
4. Run focused process tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Capacity reservation at integration HEAD 34aa9e4: TASK-143.01.16 completion opened four disjoint leaves, TASK-143.01.04, TASK-143.01.06, TASK-143.02.02, and TASK-143.06.01. Three tracked leaf workers remain active on TASK-143.01.07, TASK-143.01.18, and TASK-144.01, while the completed TASK-143.01.17 owner performs a read-only contract clarification outside tracked implementation. This reservation fills the fourth leaf-worker slot with TASK-143.01.04 because it unlocks both TASK-143.01.05 and the session chain through TASK-143.01.08. The other three ready leaves remain To Do solely because the repository caps concurrent leaf workers at four; all have disjoint ownership and should be reserved as slots free.
<!-- SECTION:NOTES:END -->
