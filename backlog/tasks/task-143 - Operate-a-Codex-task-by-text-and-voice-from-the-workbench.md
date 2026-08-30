---
id: TASK-143
title: Operate a Codex task by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 12:26'
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
Let a person at the Archboard canvas explicitly start a Codex task or attach the focused pane workbench to a task the selected app-server proves is loaded and controllable, send text, follow streamed turns and tool or approval state, and start or stop one live voice channel without leaving the canvas. Codex app-server remains the authority. Prefer a compatible same-user shared Unix daemon and fall back to an Archboard-owned app-server process. A loaded task that does not explicitly accept direct input remains visible but unavailable with its reported reason; every persisted notLoaded task has unknown cross-process ownership and remains visible but unavailable. New Archboard tasks receive centralized developer instructions. Loaded existing tasks preserve their configuration and receive additive Archboard context only on turns started from Archboard. Remote Control, proposed-diff review, and per-hunk patch actions are outside this feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane is bound to one visible thread on one identified app-server connection through an explicit new-task start or attachment to a task proven loaded and controllable on that connection. A loaded task with systemError, canAcceptDirectInput other than true, or rejoin refusal is shown unavailable with the reported reason; every notLoaded task is shown as ownership unknown. Neither unavailable class receives input
- [ ] #2 Text input, streamed messages, reasoning summaries, tool progress, supported reverse requests, interruption, completion, failure, and reconnect recovery are presented from app-server state without a second agent protocol
- [ ] #3 One live voice channel starts only for a controllable bound task and exposes permission, experimental-capability rejection, SDP and realtime-events data-channel negotiation, listening, speaking, mute, stop, device-loss, disconnect, and recovery states in both visual and nonvisual form
- [ ] #4 A compatible shared Unix daemon and the exact-binary Archboard fallback initialize with experimentalApi enabled, provide the same workbench contract, report which transport and version are active, enforce the privileged browser boundary, and never require the undocumented Desktop daemon switch. Two independent clients sharing one daemon remain isolated across overlapping requests, notifications, approvals, interruption, reconnect, and disconnect
- [ ] #5 The tracked src/runtime/codex-workbench/lib/developer-instructions.md file is the sole authored instruction text. New tasks serialize its exact UTF-8 content as thread/start developerInstructions; Archboard-origin turns on attached tasks serialize it as additionalContext.archboard with kind application; attach and reconnect apply neither field
- [ ] #6 Strict types, runtime decoding, lint, formatting, deterministic protocol and ownership tests, real-browser accessibility checks, production-bundle inspection, and live smoke tests against shared and fallback app-servers enforce the reachable lifecycle states
<!-- AC:END -->
