---
id: TASK-143.02
title: Build a typed browser module for Codex realtime voice
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:18'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the browser voice lifecycle as a deep internal UI module with one root interface and no shell, canvas, server, or runtime imports. It owns microphone capture, WebRTC negotiation inputs and outputs, peer-provided remote audio, level analysis, mute, stop, device loss, and a closed typed state model. It accepts a narrow realtime V3 adapter and an application-supplied session-context value defined at its own boundary. Package extraction remains deferred until Archboard has a second real consumer or the repository private-only policy changes explicitly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module root requires an exact connection-scoped thread link, an application-supplied start-context value, and an injected realtime adapter that has already negotiated experimentalApi and realtime V3, exposes a closed lifecycle and typed events, and has no dependency on the shell, canvas, server, runtime, generated protocol, or credentials
- [ ] #2 getUserMedia, RTCPeerConnection, MediaStream tracks, AudioContext, and AnalyserNode implement permission, SDP negotiation, remote playback, normalized input level, mute, unmute, stop, and cleanup without a third-party voice framework. Before createOffer, the peer has the microphone audio track and an ordered oai-events RTCDataChannel; the local description sent to the adapter is created only after both exist
- [ ] #3 The module handles permission denial, missing device, device removal, ICE or SDP failure, realtime-events data-channel creation failure, open timeout, error or close, adapter error, transport disconnect, repeated start or stop, late events, and recovery without leaking tracks, peer connections, data channels, audio contexts, listeners, timers, or pending promises
- [ ] #4 For WebRTC, the peer connection remote track is the only playback source. The realtime-events data channel owns its open, message, error, close, and cleanup lifecycle. The adapter maps 0.151.0 experimental thread/realtime/start and SDP plus realtimeSessionStarted, transcriptSegment, bemItemPromoted, realtimeSessionClosed, error, appendText, timeline, and stop behavior into the module's closed events; outputAudio delta remains excluded until a separate WebSocket-audio mode exists
- [ ] #5 Strict TypeScript, Oxlint, Oxfmt, unit tests with controlled browser API fakes, and a real-browser contract test enforce every reachable state transition, including audio-track and data-channel creation before createOffer, V3 capability refusal, and cleanup after each data-channel terminal state
- [ ] #6 A repository boundary test rejects imports from Archboard shell, canvas, server, runtime, and generated protocol paths so the module can be extracted later without carrying application state with it
<!-- AC:END -->
