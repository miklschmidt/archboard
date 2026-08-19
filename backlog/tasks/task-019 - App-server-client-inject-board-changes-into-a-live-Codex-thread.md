---
id: TASK-019
title: 'App-server client: inject board changes into a live Codex thread'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 18:37'
updated_date: '2026-08-19 20:03'
labels:
  - needs-triage
dependencies:
  - TASK-018
ordinal: 19000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Quiet injection via thread/inject_items is the default
- [x] #2 Loud injection via turn/steer exists but is OFF by default and switchable on for testing
- [x] #3 Injection is loopback-only and behind an explicit switch, per ADR 0005 security section
- [x] #4 Debounced; a drag does not produce a stream of injections
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/app-server-control.ts — a client for the control socket, written against the Codex source rather than against the docs. Unix socket at CODEX_HOME/app-server-control/app-server-control.sock, plain WebSocket upgrade over it (ws reaches it with {socketPath}); NOT JSON-RPC 2.0 (app-server-protocol/src/rpc.rs: "we neither send nor expect the jsonrpc field"); initialize is mandatory per connection and everything else answers -32600 until it lands; params is required even when empty. Three verbs: thread/loaded/list, thread/inject_items {threadId, items:[{type:"message",role:"developer",content:[{type:"input_text",text}]}]}, turn/steer {threadId, expectedTurnId, input:[{type:"text",text}]}. Refuses a socket this uid does not own. Declines server-to-client requests with -32601 rather than ignoring them, because a turn waiting on a reply that never comes is a hung session.

2. src/core/injection.ts — the policy layer, and the only place four questions are answered: whether to tell the agent, which thread, how loudly, how often.

3. Switch and loopback rule. Armed only from the canvas server's startup, from ARCHBOARD_INJECT plus the address actually bound. Not loopback (0.0.0.0, ::, a LAN address — the FLIP thin-client path) means injection stays off and the env var cannot override it. No HTTP route can arm it: GET /api/injection is read-only, and POST /api/injection/test only works once armed.

4. Thread selection, the open question recorded on this task: pinned ARCHBOARD_INJECT_THREAD first; else the thread that most recently called an archboard MCP tool, learned from item/started notifications where item.type is mcpToolCall and item.server matches our server key (configurable, since that key is the user's choice in config.toml); else the most recently active thread seen on this connection (turn/started, thread/started); else the only loaded thread if there is exactly one; else inject NOTHING and say why. Refusing beats interrupting a stranger's session with somebody else's drawing.

5. Quiet is the default and does the work. Loud (turn/steer) requires ARCHBOARD_INJECT_LOUD, needs a turn actually running (expectedTurnId), and falls back to quiet when the steer is refused because the turn ended. "inject test --loud" can force it for one probe without restarting the server.

6. Debounce on top of the feed's settle window: events coalesce into one message per ARCHBOARD_INJECT_DEBOUNCE_MS (4s), with a minimum ARCHBOARD_INJECT_MIN_INTERVAL_MS (10s) between injections. Agent-origin events are dropped outright — narrating the agent's own drawing back at it is noise.

7. CLI "inject status" / "inject test"; TESTING.md's "Not wired yet" paragraph replaced with how to switch injection on and how to enable loud for testing.

8. Verify: the app-server daemon is not running on this box, so stand up a stub that speaks the same wire protocol (unix socket, ws upgrade, initialize, notifications) and drive the real client against it — quiet inject, loud steer, thread selection by mcpToolCall, refusal when there is no non-arbitrary target, loopback refusal. Say plainly that the real daemon was never exercised.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented, and verified as far as this machine honestly allows.

THREAD SELECTION (the open question on this task). Decided as: pinned ARCHBOARD_INJECT_THREAD > the thread that most recently called an archboard MCP tool > the most recently active thread seen on this connection > the only loaded thread, if there is exactly one > nothing, with an explanation. The second rule is the one that carries it, and it is learned from item/started notifications where item.type is "mcpToolCall" and item.server matches our server key — configurable via ARCHBOARD_MCP_SERVER_NAME, because that key is whatever the user wrote in config.toml, not something archboard picks. Rejected: taking the newest entry from thread/loaded/list, which is ordered by id rather than by activity and would confidently pick the wrong thread. The last rule matters most: with several threads loaded and none having spoken to us, archboard injects nothing and says so, because interrupting a stranger's session with somebody else's drawing is worse than silence. Documented in TESTING.md §6 and in the module header.

Caveat found while reading the protocol: a connection is auto-subscribed to threads created or resumed AFTER it connects, so a thread that predates the canvas is invisible until it calls an archboard tool. Start the canvas before the session, or pin the thread. Said in TESTING.md.

PROTOCOL, verified against codex-rs rather than against docs: no jsonrpc field in either direction (app-server-protocol/src/rpc.rs states it outright); initialize is mandatory per connection; params is required even when empty; ThreadInjectItemsParams is {threadId, items} with items as raw Responses API values, so a developer note is {"type":"message","role":"developer","content":[{"type":"input_text","text":...}]}; TurnSteerParams carries a required expectedTurnId alongside input:[{type:"text",text}]. One trap worth recording: `ws` ignores a socketPath option next to an ordinary ws:// URL and dials localhost:80 — the unix socket needs the ws+unix://<socket>:<path> form.

Server-to-client requests are declined with -32601 rather than ignored. archboard owns nothing on this socket and must never answer an approval on the human's behalf, but silence would be worse than a refusal: a turn waiting on a reply that never comes is a hung session.

WHAT WAS ACTUALLY TESTED. The Codex app-server daemon is NOT running on this box (~/.codex/app-server-control holds only the startup lock, no socket) and realtime_conversation is off, so no real thread was ever injected into. What was exercised is the real client against a stub daemon speaking the same wire protocol over a real unix socket: initialize, thread/loaded/list, quiet thread/inject_items, loud turn/steer with a matching expectedTurnId, and the refusal path when it does not match. Plus, through the actual canvas server with a browser attached: a human drag produced exactly one quiet injection carrying the narrated change, and an agent-origin change produced none.

Guards verified: a 0.0.0.0 bind and a LAN IP both refuse to arm even with ARCHBOARD_INJECT=1 and the env var cannot override that; loopback alone without the switch does not arm; the probe refuses when not armed. Loud with a running turn steers; loud pinned to a thread with no running turn falls back to quiet.

NOT verified, and the user will be first to run it: that a real Codex app-server accepts these frames, that an injected developer item shows up in thread history the way the tests in app-server/tests/suite/v2/thread_inject_items.rs suggest, and that a loud steer reaches the voice session.

scripts/check-changes.mjs covers all of this without a daemon and is now part of `bun run test`.

Orchestrator verification of the security-critical properties, which are the ones where a mistake is dangerous. Default is off: with ARCHBOARD_INJECT unset, status reports enabled false and explains that making the agent act is a separate capability from drawing. The loopback guard is not overridable: with ARCHBOARD_INJECT=1 and the server bound to 0.0.0.0, status reports enabled true but armed FALSE, with a refusal citing ADR 0005, and the same warning is logged at startup.

My first attempt at that test was wrong and I corrected it — HOST did not reach the detached spawn, so the server was still on loopback and armed legitimately. Re-ran with the server in the foreground to get a real non-loopback bind.

Not verified, and correctly disclosed by the implementer: no real Codex app-server daemon runs on this machine and realtime is off, so nothing has been injected into a real thread. Whether Codex accepts these frames is the user's to run.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 18:38
---
User on loud injection: 'quiet injection is the obvious default. I'm not sure if loud is ever a good idea, but I'd like the option to turn it on for testing.' So build it, default it off, make it switchable — do not make the case for it in the UI or docs. Treat loud as an experiment, not a feature.
---

author: @claude
created: 2026-08-19 19:24
---
Open design question the implementer must answer: which Codex thread does archboard inject into? The app-server socket is multi-client and there may be several loaded threads. Options include an env var, discovery via thread/loaded/list, or attaching to whichever thread most recently called an archboard tool. The last is appealing — it needs no configuration and is almost always right — but decide deliberately and document it.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Injection is armed only at canvas-server start from ARCHBOARD_INJECT plus the address actually bound; a non-loopback bind refuses regardless of the env var, and no HTTP route can arm it. Quiet thread/inject_items is the default; loud turn/steer needs a second env var, needs a turn actually running, and falls back to quiet. Thread selection is a documented ladder ending in injecting nothing rather than interrupting an unrelated thread. Verified against a stub daemon over a real unix socket and a genuine browser drag; never against a real Codex daemon, which does not run here.
<!-- SECTION:FINAL_SUMMARY:END -->
