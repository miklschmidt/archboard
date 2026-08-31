---
id: TASK-143.02.02
title: Own browser media and WebRTC lifecycle
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 00:55'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.01.16
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/index.ts
  - src/ui/codex-realtime/lib/media-session.ts
  - src/ui/codex-realtime/tests/media-session.test.ts
  - src/ui/codex-realtime/tests/media-session-adversarial.test.ts
  - src/ui/codex-realtime/tests/support/media-session-fakes.ts
  - src/ui/codex-realtime/tests/support/media-session-stop-fixtures.ts
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

Remediation after reviewer feedback: start/stop/dispose now cancel dormant requests synchronously, every active phase races one run abort signal, connection failures abort pending negotiation, and dispose callers share one dominant completion. A single monotonic post-permission deadline covers offer creation through meter setup. Remote play settlement is attachment-generation scoped. Public owners cover never-settling A/B permission, phase failures and deadlines, stale play rejection, disposal dominance/reentrancy, and rejected/not-delivered/unknown/expired host stop outcomes. The fake browser, host, and clock moved to typed support/media-session-fakes.ts so the scenario owner is 402 lines rather than the previous 500-line ceiling. Validation: 49 realtime tests / 1,026 expectations; 1,055 module tests / 7,760 expectations; 130 repository tests / 415 expectations; lint, both TypeScript graphs, formatting, and frontend production build pass.

Line-count correction after formatting: the scenario owner is 400 lines and the named typed support module is 415 lines; both remain below the enforced 500-line test-source ceiling.

Third review remediation: local cleanup no longer awaits AudioContext.close() or sender.replaceTrack(null). It attaches rejection handlers, then closes the peer and stops all tracks synchronously, so pending or rejected browser promises cannot retain the lifecycle queue. Every listener-visible state and synchronous construction step now rechecks cancellation before the next browser or host call; the phase deadline helper also checks before invocation and after settlement. Public stop precedence now belongs to the active effect-bearing run, so dormant B cannot hide A host-stop rejection, not_delivered, outcome_unknown, or expiry. Explicit dispose still produces disposed after a confirmed stop, while an unconfirmed stop remains stop_failed. Adversarial owners cover three senders, pending and rejected cleanup promises, later start, stop/dispose at every public phase and construction checkpoint, and A/B precedence for all five host-stop outcomes. Validation: 57 realtime tests / 1,433 expectations; 1,063 module tests / 8,167 expectations; 130 repository tests / 415 expectations; lint, formatting, both TypeScript graphs, frontend production build, and diff check pass. media-session.test.ts is 488 lines and its typed support module is 436 lines.

Fourth review remediation: implicit restart assigns active A as public outcome owner before cleanup. An unconfirmed A stop now publishes one correlated stop_failed and rejects B with both canonical correlations; later retries remain correlated and do not emit another terminal event. Delivered stop outcomes count only when both returned identity fields exactly match the frozen request. Missing, swapped, stale, future, session-only mismatch, and correlation-only mismatch fail identically for stop, dispose, and restart. Bounded work rechecks cancellation after timer registration, and remote media rechecks after MediaStream construction, prior attachment teardown, source assignment, host attachment, and play before metering. Public ownership persists through first, concurrent, reentrant, and repeated stop, including dormant B, then resets only when C actually activates. Adversarial validation: 62 realtime tests / 2,050 expectations; 1,068 module tests / 8,784 expectations; 130 repository tests / 415 expectations; lint, formatting, both TypeScript graphs, frontend production build, and diff check pass. Both typed test files are exactly 500 lines. The first final repository rerun hit the known retained fake agent-browser cleanup race; its processes exited, the exact owner passed, and the complete repository rerun passed without a code change.

Fifth review remediation: a dequeued restart remains explicitly in-flight until activation, so reentrant stop or dispose while A awaits host-stop settlement cancels dormant B before it can replace current or allocate media. Cancellation now wins immediately after the awaited implicit stop, and synchronous browser/host boundaries recheck ownership after getAudioTracks, getReceivers, listener registration, AudioContext state and analyser sizing, localDescription, and answer field reads. Public adversarial owners restore ICE failure during a pending host answer, success at deadline minus one millisecond, and concurrent dispose preserving A stop_failed. They also cover delayed host settlement for reentrant restart stop/dispose, exact public snapshots and single terminal notification, zero B peer/meter allocation, and hostile stop/dispose from every synchronous hook. Scenario actions and assertions remain in test owners; only reusable fake stop outcomes moved to a named 57-line support fixture. Validation exited 0: 67 focused realtime tests and 2,278 expectations; 1,073 module tests and 9,012 expectations; 284 system tests and 4,198 expectations; 130 repository-policy tests and 415 expectations; all 19 serial browser owners; both strict TypeScript graphs; Oxlint; Oxfmt; Vite frontend build; diff check. Typed test/support sources are 310, 313, 476, and 57 lines. The preserved external artifact remains byte-identical at SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6, 1,516,136 bytes, mtime 2026-08-30 17:03:10 +0200. No status, assignee, acceptance check, dependency, plan, sibling record, or final summary changed.
<!-- SECTION:NOTES:END -->
