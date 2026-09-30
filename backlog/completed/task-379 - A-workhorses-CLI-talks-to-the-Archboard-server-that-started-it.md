---
id: TASK-379
title: A workhorse's CLI talks to the Archboard server that started it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 18:33'
updated_date: '2026-09-29 18:48'
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
- [x] #1 A workhorse's CLI reaches the Archboard server that started its Codex child and that server's vault, with no configuration in the repository
- [x] #2 A test proves that the Codex child's environment names the server's URL and vault
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned. buildCodexChildEnvironment takes a required archboardServer { url, vault } and writes ARCHBOARD_URL, ARCHBOARD_VAULT and ARCHBOARD_NO_AUTOSTART=1 after the allow-listed ambient keys; the allow-list is unchanged. archboardServer is required on CodexProcessOptions, so every owner of a child decides it. Production passes serverUrl() and requireVaultRoot() (absolute, resolved against the server's cwd).
ARCHBOARD_NO_AUTOSTART=1 because the child stops with its server: a thread's CLI that finds no server has outlived it, and auto-start would start a second server nobody asked for over the same vault. archboard start still overrides it.
Codex 0.158 passes these to a thread's shell commands: shell_environment_policy defaults to inherit all and only drops *KEY*, *SECRET* and *TOKEN* (codex-rs/protocol/src/shell_environment.rs:124), and Archboard's config.toml sets no policy.
Owner test: tests/system/process-contracts/codex-workbench-storage.test.ts 'isolates two live production homes and child processes, each naming its own server'. It failed with ARCHBOARD_URL null before the change and passes after. storage.test.ts keeps the builder's exact key set and ambient precedence.
Smoke: a real server on port 3419 with a scratch copy of examples/web-shop spawned the real Codex child and its native codex process with ARCHBOARD_URL=http://127.0.0.1:3419, the scratch vault and ARCHBOARD_NO_AUTOSTART=1 (/proc/<pid>/environ). The CLI run with that environment from /tmp reported url 3419 with 3 boards and showed the Web shop board.
Gate: bun run check exit 0 under systemd-run MemoryMax=16G (modules 3694 pass, system 183 pass, repository 8 pass, browser lane 18 pass).
Boards: Agent workbench@TASK-379 and Archboard@TASK-379 adopted; dogfood check has 0 diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Codex child an Archboard server spawns now carries ARCHBOARD_URL (the server's own listen URL), ARCHBOARD_VAULT (its absolute vault) and ARCHBOARD_NO_AUTOSTART=1, so a workhorse's ./bin/archboard reaches the server that started it and never starts another. Verified by the two-server process-contract test in codex-workbench-storage.test.ts (red before, green after), a real-server smoke on port 3419 reading the real child's environment and running the CLI with it, and bun run check exit 0. ADR 0019 amended, the child-environment design doc and INSTALL.md updated, Agent workbench and Archboard proposals adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
