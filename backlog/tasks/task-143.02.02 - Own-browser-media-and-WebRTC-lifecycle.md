---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.01.16
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/media-session.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement getUserMedia, RTCPeerConnection, AudioContext, AnalyserNode, data-channel events, remote audio, and exhaustive cleanup behind the frozen realtime contract. It never knows Codex thread/session semantics or reduces content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Construction order is getUserMedia, RTCPeerConnection/audio transceiver, realtime-events data channel, local offer/setLocalDescription, host offer callback, setRemoteDescription, remote audio attachment, AudioContext/AnalyserNode metering.
- [ ] #2 The implementation uses WebRTC audio only and exposes neither websocket transport nor appendAudio/outputAudio content paths; data-channel events are diagnostics/control, not a second transcript.
- [ ] #3 Permission denial, absent devices, SDP failure, ICE disconnect/fail, data-channel close, autoplay suspension, device loss, stop during every phase, restart, and unmount each produce one contract state and idempotent cleanup.
- [ ] #4 Cleanup stops every track, sender/receiver, data channel, peer, AudioContext, animation frame, listener, timer, remote audio source, and object URL exactly once; fake browser tests verify leak-free repetition.
<!-- AC:END -->
