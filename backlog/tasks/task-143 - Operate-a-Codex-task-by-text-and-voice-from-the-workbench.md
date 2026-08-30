---
id: TASK-143
title: Operate Codex threads by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 14:46'
labels: []
dependencies:
  - TASK-140.03
  - TASK-144
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
Let a person at the Archboard canvas explicitly create a thread link from the focused pane to one controllable Codex workhorse, operate it through a complete text, tool, queue, and approval workbench, keep it current with semantic board changes, and start one live voice channel through a persistent coordinator linked to that workhorse. Archboard owns one exact-version app-server child over stdio and remains its sole client authority. TASK-144 independently supplies Tailwind 4 and shadcn/Base UI; @assistant-ui/react ExternalStoreRuntime supplies conversation composition inside TASK-143.03. Remote Control, Desktop or shared app-server attachment, diff review, per-hunk patch actions, and a second MCP process are outside the feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane creates an explicit thread link to one current-epoch workhorse thread in the dedicated, separately signed-in Archboard Codex home through a new thread or attachment to a thread proven loaded and controllable on that child. Every unavailable, ownership-unknown, and prior-epoch inspect-only state remains visible but receives no input; voice requires one persistent coordinator thread linked to that exact pane and workhorse.
- [ ] #2 Text UI built in TASK-143.03 presents workhorse-first and coordinator-linked timelines, streamed messages, reasoning, ordinary and dynamic tools, queue state, all supported approvals, interruption, completion, failure, and unknown items through @assistant-ui/react ExternalStoreRuntime without introducing a second transport or state owner.
- [ ] #3 The workbench has explicit expanded and collapsed layouts, thread picker and thread-link disclosure, coordinator settings and disclosure, composer submit, steer and stop, queue controls, approval cards, claim and doing separation, and accessible desktop, two-pane, fullscreen, and 420-pixel behavior that follows the approved operator mockup.
- [ ] #4 Every general Archboard-created workhorse thread receives exactly the reviewed six coordination tools. Every coordinator receives exactly four host-bound workhorse operations plus the separate typed spoken-approval resolver required by the 0.151.0 delegation path. item/tool/call identity, target-state policy, approval freshness, transitive deadlock refusal, prior-epoch refusal, and cross-domain isolation are enforced on the same owned app-server connection without MCP.
- [ ] #5 Voice UI built in TASK-143.04 attaches one realtime V3 WebRTC session to the linked coordinator, exposes permission and negotiation progress, listening, muted, processing, speaking, approval, device-loss, disconnect, recovery, transcript, context, and persistent Stop states, and never retargets when pane focus changes. Spoken approval uses the later normal coordinator turn and typed resolver only while that coordinator is free; coordinator-blocking requests remain visual-only.
- [ ] #6 The coordinator is configurable, requests priority with visible fallback, receives exact Archboard and semantic context, remains capable under normal thread permissions, answers quick questions directly, can perform one explicit board operation, and delegates, queues, or conditionally steers sustained work under the selected intervention policy.
- [ ] #7 One configured Codex binary is authoritative for the exact reviewed 0.151.0 experimental protocol generation and the dedicated stdio child. Archboard reports version and process state, uses the exact inherited-environment allowlist, reaps it on shutdown, and never discovers or attaches to Desktop or a shared daemon.
- [ ] #8 Strict types, runtime decoding, lint, formatting, Tailwind and Base UI drift guards, app-server schema drift checks, process and ownership isolation, assistant-ui module boundaries, rendered accessibility, production bundle inspection, deterministic browser media tests, and real text and voice smoke tests enforce every reachable state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Land TASK-144 as the independent Tailwind 4 and shadcn/Base UI foundation after the implemented operator shell; do not rewrite TASK-140 scope.
2. In TASK-143.01, generate the exact reviewed 0.151.0 experimental contract and own one private stdio app-server child in a dedicated signed-in Codex and SQLite home, an external epoch manifest, cold-resume refusal, browser lease, closed reducer, and connection-scoped thread links.
3. In TASK-143.02, build the standalone browser realtime package boundary with native media and WebRTC APIs, an injected realtime adapter, strict public types, and exhaustive cleanup tests.
4. In TASK-143.05, register and route the six general dynamic thread-coordination tools on the same app-server connection.
5. In TASK-143.06, replace legacy bystander injection with semantic board context delivered only through the exact thread link and active coordinator.
6. In TASK-143.07, create the persistent capable coordinator thread with model, effort, service tier, intervention policy, four bound workhorse operations, the typed spoken resolver, safe queue behavior, callbacks, and the state-gated spoken-approval policy.
7. In TASK-143.03, pin @assistant-ui/react and map the closed browser model through ExternalStoreRuntime, then build the full text, tool, queue, approval, settings, timeline, composer, and thread-link workbench UI on TASK-144.
8. In TASK-143.04, build the complete live voice UI around TASK-143.02 and TASK-143.07, including visible context, transcript, persistent controls, spoken approvals, every failure state, same-child reconnect, and end-to-end cleanup.
9. Verify generated-contract drift, process isolation, every dynamic-tool and coordinator path, every UI state and viewport, accessibility, production module boundaries, and clean-process real text and voice smoke paths before acceptance.
<!-- SECTION:PLAN:END -->
