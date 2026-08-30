---
id: TASK-143.01
title: Own one Codex task through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 12:26'
labels: []
dependencies: []
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0005-push-to-codex-via-app-server.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the current injection-only app-server client with a deep workbench session module while preserving a separate bystander injection role. The runtime module owns one resolved Codex binary manifest, Unix or stdio transport, generated protocol decoding, connection-scoped task ownership, turn reduction, and reverse requests. A server adapter converts that state once into a closed browser message model. The browser never reaches the Unix socket, app-server process, generated protocol, or credentials directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean-checkout conformance command generates the experimental TypeScript protocol into a temporary or cache directory from one configured Codex binary, checks its version and schema manifest, and keeps generated types plus one runtime decoder private to the runtime module
- [ ] #2 Every connection initializes before other requests with capabilities.experimentalApi true and requestAttestation false unless an explicit attestation provider is installed. The configured binary path is authoritative for protocol generation and fallback spawn; a shared daemon is accepted only after initialize, experimental capability, and version-manifest compatibility, while fallback starts that exact binary with an allowlisted environment. Shared and fallback contract tests prove thread turn/item pagination and realtime methods succeed after opt-in and fail closed with an actionable incompatibility when initialize rejects or does not honor it
- [ ] #3 Thread/list always sends the explicit top-level sourceKinds allowlist [cli, vscode, exec, appServer, unknown], excluding every subAgent variant, and thread/list plus thread/loaded/list exhaust every nextCursor page before classification. Together with thread/read and rejoin, they classify exactly three outcomes at the session interface: loaded and controllable on this app-server; loaded but unavailable with the protocol or rejoin reason when status is systemError, canAcceptDirectInput is any value other than true, or rejoin refuses; and persisted notLoaded with ownership unknown. Both unavailable outcomes reject input
- [ ] #4 Thread start, rejoin of a task already proven loaded, paginated turns and items, turn start, steer, interrupt, and reconnect hydration operate on one connection-scoped thread binding. Process tests cover an Archboard-created appServer task in a fresh list and after reconnect, loaded tasks found only on later pages of thread/list and thread/loaded/list, systemError, canAcceptDirectInput false and null, rejoin refusal, and two app-servers sharing one CODEX_HOME, proving that unavailable loaded tasks and every notLoaded task fail closed
- [ ] #5 The exact UTF-8 contents of src/runtime/codex-workbench/lib/developer-instructions.md populate developerInstructions only on new thread/start. For an attached task, each Archboard-origin turn/start carries additionalContext.archboard equal to {kind: application, value: the exact file content}. Attach, rejoin, and reconnect omit developerInstructions and every other configuration override
- [ ] #6 A generated exhaustive ServerRequest policy table gates browser lease methods by negotiated capability or thread option. Owner loss answers command and file approvals with cancel, tool user input with an empty answers map, MCP elicitation with action cancel and null content and metadata, permissions with an empty turn-scoped grant, and legacy approvals with abort. currentTime/read is local; dynamic tools, auth refresh, and attestation require an explicit host provider or receive a protocol error; unknown methods receive method-not-found. One contract test covers every generated variant
- [ ] #7 One browser-connection lease owns the browser-routed reverse requests. A second owner is refused until explicit transfer, each request accepts one response, and owner loss sends the policy-table terminal response for every pending request before another owner can acquire the lease
- [ ] #8 Before connection, the runtime rejects a symlink, wrong owner, wrong type, changed inode, or mode other than 0700 for the control directory and 0600 for the socket. The workbench bridge requires an actual loopback peer, loopback Host, same-origin HTTP and WebSocket requests, no permissive CORS, and a loopback-bound canvas listener
- [ ] #9 The server adapter exposes a named closed browser model and session interface rather than generated app-server types. Process tests cover early and partial frames, late responses, reconnect, unknown events, owner loss, double response, second-tab refusal and transfer, shared mismatch, child crash and backoff, clean reap, no orphan, all three task availability outcomes, and every terminal outcome. A same-daemon integration opens two independent clients with intentionally overlapping request IDs and separate tasks, then proves notification and approval routing, interruption and reconnect isolation, and that disconnecting either client leaves the other usable
<!-- AC:END -->
