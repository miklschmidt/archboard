---
id: TASK-143.01
title: Own Codex threads through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 14:45'
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
Replace the current injection-only control-socket client with a deep workbench session module. The runtime owns one exactly reviewed Codex binary manifest, one dedicated stdio child, generated experimental protocol decoding, connection-scoped thread ownership, turn and queue reduction, reverse requests, and cold-resume refusal. A server adapter converts that state once into a closed browser message model. The browser never reaches the child process, generated protocol, credentials, rollout storage, or ambient Desktop configuration directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean-checkout conformance command resolves the configured binary, requires codex-cli 0.151.0 exactly, runs codex app-server generate-ts --experimental into a temporary or cache directory, hashes the generated schema surface, and keeps generated types plus one runtime decoder private to the runtime module. Any other binary version or schema hash fails with an actionable update-and-review message; a fixture generated without --experimental fails because it omits required realtime and dynamic-tool contracts.
- [ ] #2 The configured 0.151.0 binary path is authoritative. The runtime starts that exact binary as one dedicated stdio app-server child and initializes once with capabilities.experimentalApi true and requestAttestation false unless an explicit attestation provider is installed. Initialization success establishes only protocol readiness because InitializeResponse does not echo experimental acceptance; each experimental method must still return its typed success or actionable rejection, and realtime is active only after thread/realtime/start succeeds and thread/realtime/started reports v3 for the exact thread.
- [ ] #3 Thread/list always sends the explicit top-level sourceKinds allowlist [cli, vscode, exec, appServer, unknown], excluding every subAgent variant, and thread/list plus thread/loaded/list exhaust every nextCursor page before classification. Together with thread/read and the Archboard epoch manifest, they classify current-epoch loaded and controllable, current-epoch loaded but unavailable, persisted current-epoch notLoaded with ownership unknown, and prior-epoch inspect-only. Every class except the first rejects input; prior-epoch state permits only list and read.
- [ ] #4 Thread start, rejoin of a thread proven loaded and safe for this ownership domain, paginated turns and items, turn start, steer, interrupt, exhaustive queue operations, and reconnect hydration operate on one connection-scoped thread link. Browser reconnect to the same live child rehydrates it; child exit invalidates every ownership proof and a replacement child never resumes or accepts input automatically. Process tests cover fresh threads, later pages, every unavailable state, same-child reconnect, and replacement-child refusal.
- [ ] #5 The exact UTF-8 contents of src/runtime/codex-workbench/lib/developer-instructions.md populate developerInstructions for general Archboard thread/start. A voice coordinator deterministically appends the exact UTF-8 contents of voice-coordinator-instructions.md with one tested separator and no other authored text. For an attached workhorse, each Archboard-origin turn/start carries additionalContext.archboard equal to {kind: application, value: the exact shared file content}. Attach, rejoin, reconnect, and thread/fork omit developerInstructions and configuration overrides
- [ ] #6 A generated exhaustive ServerRequest policy table gates browser lease methods by negotiated capability or thread option. Owner loss answers each approval or elicitation with its generated terminal response. currentTime/read is local; item/tool/call delegates only to a registered general or coordinator dynamic-tool provider; auth refresh and attestation require explicit host providers or receive protocol errors; unknown methods receive method-not-found. One contract test covers every generated variant
- [ ] #7 One browser-connection lease owns browser-routed reverse requests. A second owner is refused until explicit transfer, each request accepts one response, and owner loss sends the policy-table terminal response for every pending request before another owner can acquire the lease
- [ ] #8 The child command, arguments, working directory, and environment come only from one typed runtime manifest. Archboard sets CODEX_HOME to a stable dedicated app-state directory and CODEX_SQLITE_HOME to a dedicated child of that directory; neither is inherited. The dedicated home uses its own supported account/login/start flow and mutable auth store, never a symlink to the default auth.json or a borrowed bearer token. Selected non-secret configuration may be copied one way at setup and invariant overrides are passed as repeatable -c values; no mutable config symlink is shared. The inherited allowlist is exactly HOME, USER, LOGNAME, SHELL, PATH, XDG_CONFIG_HOME, XDG_CACHE_HOME, XDG_DATA_HOME, XDG_STATE_HOME, XDG_RUNTIME_DIR, TMPDIR, LANG, LC_ALL, TERM, COLORTERM, SSH_AUTH_SOCK, DISPLAY, WAYLAND_DISPLAY, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY, http_proxy, https_proxy, all_proxy, no_proxy, SSL_CERT_FILE, NIX_SSL_CERT_FILE, NIX_PATH, and NIX_PROFILES; every other ambient key is removed.
- [ ] #9 The server adapter exposes a named closed browser model and session interface rather than generated app-server types. Process tests cover partial frames, late responses, unknown events, lease loss, double response, transfer, clean reap, crash and backoff, exclusive-home lock refusal, independent sign-in state, every availability and terminal outcome, plus two children with overlapping request IDs in separate dedicated homes proving notification, approval, queue, dynamic-tool, interruption, and shutdown isolation.
- [ ] #10 An Archboard-owned epoch manifest outside Codex rollout and SQLite storage records the child epoch and every thread created or linked in it. A replacement child creates a new epoch, treats every prior-epoch thread as inspect-only, and rejects thread/resume, thread/fork by ID, path or history, turn/start, turn/steer, queue/start, dynamic-tool dispatch, and every execution path even if 0.151.0 restored dynamicTools or a persisted queue. A process test proves cold resume would dispatch queued work without this guard and proves Archboard never calls it. The UI and docs state that the dedicated home prevents accidental discovery but is not a protocol security boundary against another same-user process intentionally pointed at its paths.
<!-- AC:END -->
