---
id: TASK-143
title: Operate a Codex task by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 13:08'
labels: []
dependencies:
  - TASK-140.03
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/desktop-remote-control-integration-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
priority: high
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let a person at the Archboard canvas explicitly start a Codex task or attach the focused pane workbench to a task that the dedicated Archboard-owned app-server proves is loaded and controllable, send text, follow streamed turns and tool or approval state, and start or stop one live voice channel without leaving the canvas. Archboard starts one exact-version app-server child over stdio and remains its sole client authority. The agent receives a small Archboard-authored task-coordination MCP catalogue backed by that same runtime. A loaded task that does not explicitly accept direct input remains visible but unavailable with its reported reason; every persisted notLoaded task has unknown cross-process ownership and remains visible but unavailable. New Archboard tasks receive centralized developer instructions. Loaded existing tasks preserve their configuration and receive additive Archboard context only on turns started from Archboard. Remote Control, Desktop app-server attachment, proposed-diff review, and per-hunk patch actions are outside this feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane is bound to one visible thread on the dedicated Archboard-owned app-server through an explicit new-task start or attachment to a task proven loaded and controllable on that connection. A loaded task with systemError, canAcceptDirectInput other than true, or rejoin refusal is shown unavailable with the reported reason; every notLoaded task is shown as ownership unknown. Neither unavailable class receives input
- [ ] #2 Text input, streamed messages, reasoning summaries, tool progress, supported reverse requests, interruption, completion, failure, and reconnect recovery are presented from app-server state without a second agent lifecycle protocol
- [ ] #3 The Codex agent receives exactly the reviewed Archboard task-coordination tools through an Archboard-authored MCP adapter. Tool calls retain calling thread and turn identity, delegate lifecycle state to the workbench runtime, apply explicit mutation approvals, reject self-target deadlocks, and contain no copied or executed Desktop app-tool code
- [ ] #4 One live voice channel starts only for a controllable bound task and exposes permission, experimental-capability rejection, SDP and realtime-events data-channel negotiation, listening, speaking, mute, stop, device-loss, disconnect, and recovery states in both visual and nonvisual form
- [ ] #5 One configured Codex binary is authoritative for protocol generation and for the dedicated stdio child. Archboard reports its version and process state, uses an allowlisted environment, reaps the child and MCP adapter on shutdown, and never discovers, configures, or attaches to a Desktop or shared app-server daemon
- [ ] #6 The tracked src/runtime/codex-workbench/lib/developer-instructions.md file is the sole authored instruction text. New tasks serialize its exact UTF-8 content as thread/start developerInstructions; Archboard-origin turns on attached tasks serialize it as additionalContext.archboard with kind application; attach and reconnect apply neither field
- [ ] #7 Strict types, runtime decoding, lint, formatting, deterministic protocol, process, tool-routing, and ownership tests, real-browser accessibility checks, production-bundle inspection, and live smoke tests against the dedicated exact-binary app-server enforce every reachable lifecycle state
<!-- AC:END -->
