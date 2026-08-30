---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.02.04
  - TASK-143.02.05
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - packages/codex-realtime/src/realtime-session
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the framework-neutral media engine in `packages/codex-realtime/src/realtime-session`. It owns browser resources and deterministic state transitions; the injected adapter remains its only host dependency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 getUserMedia, RTCPeerConnection, an ordered oai-events data channel created before the offer, remote-track playback, AudioContext, and AnalyserNode implement permission, negotiation, levels, mute, unmute, and stop through the frozen package API.
- [ ] #2 The package media machine covers idle, permission, negotiating, connected/listening, muted, agent-speaking, stopping, stopped, device loss, ICE/SDP/data-channel/adapter/transport failure, and repeated or late commands; host binding/realtime authority stays injected.
- [ ] #3 Every track, peer, channel, audio node/context, listener, timer, and playback element is released exactly once on all terminal paths; recovery creates fresh resources only after the prior session is stopped and closed.
- [ ] #4 Tests at packages/codex-realtime/src/realtime-session/tests use controlled browser fakes plus one package real-browser contract owner to prove creation order, remote-track-only playback, same-binding restart serialization, late events, recovery, and no leaks.
<!-- AC:END -->
