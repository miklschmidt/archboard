---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.02.01
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
- [ ] #1 `getUserMedia`, `RTCPeerConnection`, an ordered `oai-events` data channel created before the offer, remote-track playback, `AudioContext`, and `AnalyserNode` implement permission, negotiation, levels, mute, unmute, and stop.
- [ ] #2 The discriminated state model covers idle, permission, negotiating, connected/listening, muted, agent speaking, recovering, stopping, stopped, device loss, ICE/SDP/data-channel/adapter/transport failures, and repeated or late commands.
- [ ] #3 Every owned track, peer, channel, audio node/context, listener, timer, and playback element is released exactly once on all terminal and recovery paths.
- [ ] #4 Controlled browser fakes and one real-browser contract owner prove creation order, remote-track-only playback, late-event behavior, recovery, and no leaked resources.
<!-- AC:END -->
