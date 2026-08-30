---
id: TASK-143
title: Operate a Codex task by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 14:18'
labels: []
dependencies:
  - TASK-140.03
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/desktop-remote-control-integration-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
priority: high
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let a person at the Archboard canvas explicitly start a Codex workhorse task or attach the focused pane to a task that the dedicated Archboard-owned app-server proves is loaded and controllable, send text, follow streamed turns and approvals, keep the task current with semantic board changes, and start one live voice channel through a persistent fast coordinator linked to that workhorse. Archboard starts one exact-version app-server child over stdio and remains its sole client authority. Archboard-created workhorses receive centralized instructions and a reviewed general dynamic task-coordination catalogue; voice coordinators receive exact role instructions and a smaller host-bound catalogue. All calls return as typed item/tool/call requests on the same connection. Remote Control, Desktop or shared app-server attachment, diff review, per-hunk patch actions, and a second MCP process are outside this feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane is bound to one visible workhorse on the dedicated Archboard-owned app-server through an explicit new-task start or attachment to a task proven loaded and controllable on that connection. Loaded systemError, direct-input refusal, rejoin refusal, and persisted notLoaded ownership-unknown states remain visible but receive no input. Voice additionally requires one explicit persistent coordinator linked to that exact pane and workhorse
- [ ] #2 Text input, streamed messages, reasoning summaries, tool progress, supported reverse requests, interruption, completion, failure, same-child browser reconnect recovery, child-exit invalidation, and linked workhorse-coordinator timelines are presented from app-server state without a second agent lifecycle protocol
- [ ] #3 Every general task started by Archboard receives exactly the reviewed six task-coordination dynamic tools; a voice coordinator receives exactly its four host-bound workhorse operations. Typed item/tool/call requests retain server-supplied calling identity, apply the correct target-state and approval policy, reject deadlocks and cross-process ownership, and require no MCP adapter, private socket, or copied Desktop code
- [ ] #4 One live voice channel attaches realtime V3 to a configurable fast coordinator that requests priority service with visible standard fallback, includes exact Archboard and semantic board context, remains capable under normal task permissions, delegates or queues sustained work to the workhorse, can perform one explicit board operation directly, and exposes permission, negotiation, context, listening, speaking, approval, device-loss, disconnect, and recovery states accessibly
- [ ] #5 One configured Codex binary is authoritative for experimental protocol generation and the dedicated stdio child. Archboard reports its version and process state, uses the manifest's exact inherited-environment key set, reaps it on shutdown, and never discovers, configures, or attaches to a Desktop or shared app-server daemon
- [ ] #6 Tracked shared developer instructions are the sole common task text, and tracked voice-coordinator instructions are the sole coordinator role extension. New workhorses serialize the exact shared UTF-8 content; coordinators serialize one deterministic composition of shared and coordinator content; Archboard-origin turns on attached tasks carry only the exact shared content as additionalContext.archboard; attach and reconnect apply neither thread override
- [ ] #7 Strict types, runtime decoding, lint, formatting, protocol drift checks, process and ownership isolation, general and coordinator dynamic-tool routing, semantic-context delivery, queue and callback behavior, rendered accessibility, production-bundle inspection, and real text and voice smoke tests against the dedicated exact-binary app-server enforce every reachable state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the configured Codex binary contract at 0.151.0 or later by generating TypeScript with --experimental, then own one isolated stdio child and connection-scoped thread links.
2. Reduce app-server events and reverse requests into the closed browser session model, including same-child reconnect, approval ownership, and fail-closed child exit.
3. Register the six general coordination tools at workhorse thread/start and the four host-bound operations at coordinator thread/start; handle all item/tool/call requests on the same connection.
4. Replace legacy control-socket injection with semantic board context on the exact bound workhorse and active coordinator.
5. Build the Tailwind/Base UI and assistant-ui workbench around linked workhorse and coordinator timelines, preserving reference-mockup aesthetics and accessibility.
6. Create the persistent capable coordinator with global model, effort, priority and intervention settings, app-server queue management, event-driven callbacks, and the accepted spoken one-time approval policy.
7. Implement browser-native WebRTC voice against realtime V3 with fresh startup context, live selection and semantic deltas, transcript-tail flush to the coordinator, and same-child recovery.
8. Verify generated-contract drift, process isolation, every tool and orchestration policy, semantic routing, rendered states, accessibility, production bundle boundaries, and real text and voice smoke paths before acceptance.
<!-- SECTION:PLAN:END -->
