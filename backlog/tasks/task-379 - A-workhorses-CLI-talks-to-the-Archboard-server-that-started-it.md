---
id: TASK-379
title: A workhorse's CLI talks to the Archboard server that started it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 18:33'
updated_date: '2026-09-29 18:38'
labels:
  - codex
dependencies: []
priority: high
type: bug
ordinal: 663000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Codex child an Archboard server starts gets no ARCHBOARD_URL or ARCHBOARD_VAULT, so a workhorse's ./bin/archboard falls back to http://127.0.0.1:3000 and whatever vault that server holds. On 2026-09-29 a workhorse of a server on port 3404 with the vault /tmp/web-shop asked the server on port 3000 for the Web shop board and was refused twice with 'no semantic board', before it answered from the selection alone. Any server not on port 3000 hands its agents the wrong server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A workhorse's CLI reaches the Archboard server that started its Codex child and that server's vault, with no configuration in the repository
- [ ] #2 A test proves that the Codex child's environment names the server's URL and vault
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give the Codex child's environment builder (src/runtime/codex-process/lib/environment.ts) a required archboardServer input { url, vault } and write ARCHBOARD_URL, ARCHBOARD_VAULT and ARCHBOARD_NO_AUTOSTART=1 after the allow-listed ambient keys, beside CODEX_HOME and CODEX_SQLITE_HOME. The allow-list itself stays as it is.
2. Make archboardServer a required field of CodexProcessOptions so every owner of a child decides it; the production installation (src/server/archboard/lib/codex-workbench-production.ts) passes serverUrl() from listener-address and requireVaultRoot() from the engine, which is the server's own vault resolved against the server's cwd.
3. ARCHBOARD_NO_AUTOSTART=1: the child is owned by the server and stops with it, so a workhorse's CLI that finds no server at that URL is talking past a server that is gone or restarting. Auto-start would then start a second server from the child's stripped environment that nobody asked for, with its own Codex child. An explicit archboard start still overrides it.
4. Owner test: the fake Codex of tests/system/server-state/fixtures/fake-codex-production.ts records the three values in its app_server_spawn record, and the two-server test in tests/system/process-contracts/codex-workbench-storage.test.ts asserts each child names its own server's URL and vault. Prove it fails without the change. Update the unit test of the builder's exact key set.
5. Docs: docs/design/codex-workbench-authored-contracts.md (Dedicated child environment) and INSTALL.md (several servers) say what the child's environment names. ADR 0019 gets a short amendment.
6. Boards: Agent workbench@TASK-379 (Codex process description, spawn edge label) and Archboard@TASK-379 (Codex app-server description). No part or relationship is added or removed.
7. Gate: bun run check under systemd-run memory limits.
<!-- SECTION:PLAN:END -->
