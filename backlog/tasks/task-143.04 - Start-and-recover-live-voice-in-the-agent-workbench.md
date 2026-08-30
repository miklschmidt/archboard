---
id: TASK-143.04
title: Start and recover live voice in the agent workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 12:26'
labels: []
dependencies:
  - TASK-143.02
  - TASK-143.03
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the internal Codex realtime voice module into the controllable workbench task. The workbench supplies the exact connection-scoped binding and browser adapter, renders lifecycle and transcript state, and proves the browser to app-server to WebRTC path. Voice neither creates nor chooses a task implicitly, and only one session may run in the application.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Start voice is enabled only for a task proven controllable on a connection that accepted experimentalApi, asks for microphone access in response to the user action, and binds realtime start and SDP negotiation to that exact connection and thread. Rejection of the experimental capability disables voice with an actionable compatibility message
- [ ] #2 The workbench exposes start, mute, unmute, and stop with visible listening and agent-speaking state, a restrained live level or waveform from AnalyserNode, remote playback only from the WebRTC track, visible realtime-events data-channel negotiation state, and equivalent text status for screen readers
- [ ] #3 Canonical partial and final user and assistant transcript events join the bound task timeline without duplication, late deltas after stop are ignored, and typed and spoken turns preserve one chronological app-server history
- [ ] #4 Changing pane focus never retargets or hides an active session: a persistent indicator names its source pane and task and keeps Stop reachable. Rebinding or closing the source pane is refused until voice stops
- [ ] #5 Permission denial, no device, removed device, autoplay refusal, data-channel creation or open failure, data-channel error or close, SDP or ICE negotiation failure, experimental-capability rejection, app-server disconnect, realtime error, collapse, fullscreen, and browser reconnect each produce a truthful recoverable state and release media resources
- [ ] #6 A deterministic browser lane uses controlled media, peer, and data-channel fakes to prove audio and the ordered oai-events channel exist before createOffer and to cover every state and cleanup path, while a manual microphone and speaker check against a compatible bundled shared daemon proves real audio input, agent output, transcript, stop, and restart
- [ ] #7 The same smoke scenario runs against the exact-binary Archboard-owned fallback, and absence or rejection of the undocumented Desktop shared-daemon path does not disable Archboard voice
<!-- AC:END -->
