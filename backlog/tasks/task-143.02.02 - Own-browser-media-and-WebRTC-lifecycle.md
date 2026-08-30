---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 23:32'
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

Implemented the public realtime media factory and literal WebRTC-audio feature marker behind src/ui/codex-realtime/index.ts. The closure-owned session performs the required microphone, peer/transceiver, realtime-events channel, SDP host callback, remote media, and analyser sequence. Correlated restarts use a fresh lifecycle; permission, device, SDP, ICE, channel, remote media, autoplay, device-loss, stop, and dispose paths converge on one frozen contract state with memoized host stop and idempotent cleanup. Public-index-only fake-browser tests cover six stop races and prove tracks, senders, receivers, channel, peer, audio nodes/context, animation frame, browser listeners, timers, media element source, and object URL are released once. No WebSocket, audio-chunk, transcript reduction, React, assistant-ui, generated protocol, or runtime dependency was added. Validation exited 0: focused realtime owners 24 tests and 663 expectations; complete module lane 1,030 tests and 7,397 expectations across 77 files; complete repository lane 130 tests and 415 expectations across 11 files; both strict TypeScript projects; Oxlint; Oxfmt on 522 files; Vite frontend build; git diff check. The first repository run had one transient retained fake agent-browser PID in its existing cleanup-timing test; the PID exited, the exact owner passed on rerun, and the full repository rerun passed.

Review remediation for 11232c9 completed on the unchanged fixed base. Lifecycle operations now share one queue while stop and dispose cancel the active run synchronously; each run owns its snapshot, so three overlapping starts return correlations 1, 2, and 3 and every superseded peer, track, timer, listener, audio node, and frame is released once. start clones and freezes correlation before queued work, and snapshots plus createOffer, attachment, and stop use that canonical record despite caller mutation. Repeated remote attachments fully pause, clear srcObject, remove src, and load the prior element before replacement. Error, stopping, stop-failed, and closed publications carry level zero to listeners and getSnapshot. A fired meter frame clears its id and rechecks cancellation after listeners run, which closes listener-triggered stop and dispose races without another frame. The unsupported MediaStream-to-Blob object URL fallback and every product as-unknown DOM cast were removed; HTMLMediaElement.srcObject is the only remote source path. The two deadline helpers became one cancellable helper. Recoverable and terminal failure functions remain separate because their reason types differ. Public fake-browser oracles cover all six findings and the prior lifecycle matrix. Validation exited 0: focused realtime owners 24 tests and 647 expectations; complete module lane 1,030 tests and 7,380 expectations across 77 files; complete repository lane 130 tests and 415 expectations across 11 files; both strict TypeScript projects; Oxlint; Oxfmt on 522 files; Vite frontend build; diff check. No status, assignee, acceptance check, dependency, plan, sibling record, or final summary changed.
<!-- SECTION:NOTES:END -->
