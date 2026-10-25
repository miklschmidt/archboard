---
id: TASK-530.01
title: The voice server interface is a few host operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T04:41:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard imports about 107 internal names (epoch stores, wait graphs, thread-link proofs, callback ports) that the example does not need, and the core hard-codes Archboard identity: serviceName, threadSource, tool namespaces, the coordinator manifest text and the spoken-approval prompt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The server, runtime and shared entries expose only host-facing operations, options and types
- [ ] #2 Identity strings on the wire and in prompts are host options with neutral defaults, and Archboard passes its existing values
- [x] #3 The browser socket wiring the example hand-writes is a package operation
- [x] #4 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
createVoiceAgent(options) with start/status/attach/shutdown/browser/instructions is the server entry (packages/codex-realtime-voice/src/server/services/agent). attach(server, {path, origin, checkout?}) replaces the example's hand-written upgrade handling; the example and Archboard's production wiring both call createVoiceAgent. Identity: serviceName/threadSource are host options (default codex-realtime-voice), Archboard passes archboard; profile bytes unchanged (archboard-profiles.test.ts). Tool namespaces (archboard_workhorse, archboard_voice, archboard_coordinator), archboard_app in the browser schema and the archboard:* record prefixes are still hard-coded. Semantic callbacks became host-context events with a host payload. Counts: voice runtime 134->71, server 45->28; workbench runtime 4->2. Left: runtime still exposes Archboard's domain-tools internals (epoch, wait graph, thread link), the callback engine for Archboard's tests, instruction byte checks; contract+realtime (42) are mostly consumed by Archboard's UI (TASK-530.02).

Round 2: Archboard derives its epoch, thread-link, wait-graph, session, workhorse, approval-action, socket-instance, context-publisher and callback-policy types from VoiceAgentExtensions/VoiceAgentBrowserPort (packages/workbench/src/runtime/protocol/voice/extension.ts); voice runtime 71->53, server 28->21; ceilings codex-realtime-voice 134, workbench 150. The browser dynamic-approval schema now accepts the host's namespace (Archboard sends archboard_app). Still open for AC #2: the core tool namespaces archboard_workhorse/archboard_voice/archboard_coordinator (manifests and digests are module-level constants, the transport registers them in factories.ts installDynamicRegistrations, incoming calls are checked against literal names in about ten sites, and the classifier prompt is pinned by digest; estimated an hour or more), the coordinator manifest description that says Archboard, and the archboard: record prefix, which codex-app-server mints (WIRE_PREFIX in src/shared/schemas/identity-values.ts, TASK-530.03 scope) along with its client name archboard in runtime/services/session.ts.

Bun.serve support on voice/bun-serve: VoiceAgent.bunHandlers takes path, fetch, websocket, origin and checkout, and returns the fetch and websocket of Bun.serve options, spread into Bun.serve. A wrapping shape replaced the suggested nullish composition because Bun requires fetch to return undefined after an upgrade, which nullish composition cannot tell apart from another path. Requests that are no socket upgrade on the path go to the host fetch, default 404. Sockets the host upgrades itself go to the host websocket handlers, told apart by a private VoiceSocket data class. The origin defaults to the receiving server url origin, so port 0 works. After shutdown the path answers upgrades with 503 and open sockets are terminated and released; server.reload with a new result serves again. The shared admission in src/server/services/agent/admission.ts is used by attach.ts for node:http, behaviour unchanged, and by bun-serve.ts. Bun send status 0 is a failed publication; -1 and positive counts are taken frames. No new exported name. apps/workbench-example runs on Bun.serve; its malformed-upgrade probe was removed because Bun rewrites an unparseable target to the root path. docs/agents/boundaries.md still says the example calls agent.attach.

Socket adapter review (review/voice-sockets): aca898867 ends a Bun socket whose frame Bun dropped over backpressureLimit (before, a dropped event left the socket open and terminal approvals unacknowledged); 97eb7cecd tests serving again after shutdown with server.reload; 650623f9e restores the attach malformed-upgrade 400 and detach tests that the example's move to Bun.serve had removed; e84533224 names both adapters in boundaries.md, the README and the TSDoc, and says when the server.url origin default needs an explicit origin (0.0.0.0, no hostname, a proxy, a unix socket: each fails closed with 403).
<!-- SECTION:NOTES:END -->
