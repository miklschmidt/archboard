---
id: TASK-143.01.04
title: Own the dedicated Codex app-server child
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:25'
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
Own one dedicated Codex 0.151.0 stdio child, exact environment construction, effective storage roots, stderr drainage, restart policy, and process shutdown. The child never attaches to Desktop or a shared daemon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact argv is the configured absolute codex binary followed by app-server, --stdio, --strict-config; version is proven as 0.151.0 before readiness and no daemon, proxy, listen, websocket, analytics-default, code-mode-host, or Desktop MCP argument is accepted.
- [ ] #2 The child environment is built from the documented allowlist PATH, HOME, USER, LOGNAME, SHELL, LANG, LC_*, TERM, COLORTERM, TZ, TMPDIR/TMP/TEMP, XDG_RUNTIME_DIR, display/session variables, SSH_AUTH_SOCK, proxy variables, and TLS certificate variables, then overwrites dedicated CODEX_HOME and CODEX_SQLITE_HOME and strips all ambient CODEX_*, OPENAI_*, AWS credential/profile, app-server listener/auth, daemon, and ChatGPT Desktop variables.
- [ ] #3 Dedicated home/sqlite directories are absolute, private, distinct from user/Desktop roots, created with restrictive permissions, and stderr is continuously drained into bounded diagnostics without sharing stdout framing.
- [ ] #4 Missing/wrong binary, locked/unwritable roots, bad config, early exit, crash, backoff, TERM/KILL escalation, and stopped state are deterministic and covered by process tests with no orphan.
<!-- AC:END -->
