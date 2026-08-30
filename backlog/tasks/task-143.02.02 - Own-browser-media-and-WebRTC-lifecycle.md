---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 22:55'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.01.16
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/lib/media-session.ts
  - src/ui/codex-realtime/index.ts
  - src/ui/codex-realtime/tests/media-session.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement getUserMedia, RTCPeerConnection, AudioContext, AnalyserNode, data-channel events, remote audio, and exhaustive cleanup in src/ui/codex-realtime/lib/media-session.ts behind the frozen realtime index. It never knows Codex thread/session semantics or reduces content.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Construction order is getUserMedia, RTCPeerConnection/audio transceiver, realtime-events data channel, local offer/setLocalDescription, host offer callback, setRemoteDescription, remote audio attachment, AudioContext/AnalyserNode metering.
- [ ] #2 The implementation uses WebRTC audio only and exposes neither websocket transport nor appendAudio/outputAudio content paths; data-channel events are diagnostics/control, not a second transcript.
- [ ] #3 Permission denial, absent devices, SDP failure, ICE disconnect/fail, data-channel close, autoplay suspension, device loss, stop during every phase, restart, and unmount each produce one contract state and idempotent cleanup.
- [ ] #4 Cleanup stops every track, sender/receiver, data channel, peer, AudioContext, animation frame, listener, timer, remote audio source, and object URL exactly once; fake browser tests consume only the public index and verify leak-free repetition.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the frozen browser realtime port with current browser media APIs, shared timing, test shims, and frontend lifecycle conventions.
2. Implement the ordered getUserMedia/WebRTC/data-channel/remote-audio/AudioContext session behind the existing public index, keeping Codex thread and transcript semantics outside this module.
3. Drive permission, device, SDP, ICE, channel, autoplay, stop-at-every-phase, restart, and unmount states through deterministic fake-browser tests that prove every resource and listener is released exactly once.
4. Run focused public media tests, frontend/module/repository gates, both TypeScript projects, lint, format, build where relevant, diff and clean-status checks; record evidence without finalizing before independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel reservation at integration HEAD 863ec41 after removing the unjustified worker/reviewer caps: TASK-143.02.02 is dependency-ready and owns a disjoint browser-media boundary. It is dispatched now instead of waiting behind unrelated runtime work.
<!-- SECTION:NOTES:END -->
