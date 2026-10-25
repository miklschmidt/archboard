---
id: TASK-530.01
title: The voice server interface is a few host operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T02:21:00Z'
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
<!-- SECTION:NOTES:END -->
