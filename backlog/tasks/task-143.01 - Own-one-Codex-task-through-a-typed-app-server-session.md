---
id: TASK-143.01
title: Own one Codex task through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 14:18'
labels: []
dependencies: []
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the current injection-only control-socket client with a deep workbench session module. The runtime owns one resolved Codex binary manifest, one dedicated stdio child, generated experimental protocol decoding, connection-scoped task ownership, turn reduction, and reverse requests. A server adapter converts that state once into a closed browser message model. The browser never reaches the child process, generated protocol, credentials, or ambient Desktop configuration directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean-checkout conformance command runs the configured binary's codex app-server generate-ts --experimental into a temporary or cache directory, checks the reported version and schema manifest, and keeps generated types plus one runtime decoder private to the runtime module. A fixture generated without --experimental must fail because it omits required realtime and dynamic-tool contracts
- [ ] #2 The configured binary path is authoritative. The runtime starts that exact binary as one dedicated stdio app-server child, initializes once with capabilities.experimentalApi true and requestAttestation false unless an explicit attestation provider is installed, and rejects an initialization response that does not honor the required contract. Contract tests prove thread, turn, item-pagination, dynamic-tool, queue, model-list, and realtime methods succeed after opt-in and fail closed with an actionable incompatibility
- [ ] #3 Thread/list always sends the explicit top-level sourceKinds allowlist [cli, vscode, exec, appServer, unknown], excluding every subAgent variant, and thread/list plus thread/loaded/list exhaust every nextCursor page before classification. Together with thread/read and rejoin, they classify exactly three outcomes: loaded and controllable; loaded but unavailable with its systemError, direct-input, or rejoin reason; and persisted notLoaded with ownership unknown. Both unavailable outcomes reject input
- [ ] #4 Thread start, rejoin of a task already proven loaded, paginated turns and items, turn start, steer, interrupt, queue operations, and reconnect hydration operate on one connection-scoped thread link. Browser reconnect to the same live child rehydrates it; child exit invalidates every ownership proof and a replacement child never resumes or accepts input automatically. Process tests cover fresh tasks, later pages, every unavailable state, same-child reconnect, and replacement-child refusal
- [ ] #5 The exact UTF-8 contents of src/runtime/codex-workbench/lib/developer-instructions.md populate developerInstructions for general Archboard thread/start. A voice coordinator deterministically appends the exact UTF-8 contents of voice-coordinator-instructions.md with one tested separator and no other authored text. For an attached workhorse, each Archboard-origin turn/start carries additionalContext.archboard equal to {kind: application, value: the exact shared file content}. Attach, rejoin, reconnect, and thread/fork omit developerInstructions and configuration overrides
- [ ] #6 A generated exhaustive ServerRequest policy table gates browser lease methods by negotiated capability or thread option. Owner loss answers each approval or elicitation with its generated terminal response. currentTime/read is local; item/tool/call delegates only to a registered general or coordinator dynamic-tool provider; auth refresh and attestation require explicit host providers or receive protocol errors; unknown methods receive method-not-found. One contract test covers every generated variant
- [ ] #7 One browser-connection lease owns browser-routed reverse requests. A second owner is refused until explicit transfer, each request accepts one response, and owner loss sends the policy-table terminal response for every pending request before another owner can acquire the lease
- [ ] #8 The child command, arguments, working directory, and environment come only from one typed runtime manifest. The inherited key set is exactly HOME, USER, LOGNAME, SHELL, PATH, CODEX_HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME, XDG_DATA_HOME, XDG_STATE_HOME, XDG_RUNTIME_DIR, TMPDIR, LANG, LC_ALL, TERM, COLORTERM, SSH_AUTH_SOCK, DISPLAY, WAYLAND_DISPLAY, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY, http_proxy, https_proxy, all_proxy, no_proxy, SSL_CERT_FILE, NIX_SSL_CERT_FILE, NIX_PATH, and NIX_PROFILES; absent keys stay absent and every other ambient key is removed. The browser bridge requires actual loopback peer and Host, same-origin HTTP and WebSocket, no permissive CORS, and a loopback listener
- [ ] #9 The server adapter exposes a named closed browser model and session interface rather than generated app-server types. Process tests cover partial frames, late responses, unknown events, lease loss, double response, transfer, child crash and backoff, clean reap, every availability and terminal outcome, plus two children with overlapping request IDs and separate tasks under one CODEX_HOME proving notification, approval, queue, dynamic-tool, interruption, and shutdown isolation
<!-- AC:END -->
