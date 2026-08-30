---
id: TASK-143.02
title: Build a standalone browser package for Codex realtime voice
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:36'
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
Build the browser-native Codex realtime lifecycle as a standalone package-shaped module with one public interface and no Archboard, React, assistant-ui, shell, canvas, server, runtime, generated-protocol, credential, or Node imports. It owns microphone capture, WebRTC, remote audio, level analysis, mute, stop, device loss, deterministic recovery, and complete cleanup. Archboard injects the exact app-server realtime adapter and session context. The package remains private and unpublished while this repository policy says Archboard is private, but it is designed and verified so a later publication decision does not require extracting application state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A standalone workspace package has its own package.json, public export map, strict tsconfig, lint and format inclusion, and one documented root API. It remains private and unpublished under the repository policy, but its source and public types do not depend on Archboard paths so publishing later requires a policy decision rather than a rewrite.
- [ ] #2 The package root requires an opaque application thread-link value, application-supplied start-context, and an injected realtime V3 adapter with a closed lifecycle and typed events. It has no dependency on the Archboard shell, canvas, server, runtime, generated app-server protocol, credentials, assistant-ui, Tailwind, React, or Node APIs.
- [ ] #3 getUserMedia, RTCPeerConnection, MediaStream tracks, AudioContext, and AnalyserNode implement permission, SDP negotiation, remote playback, normalized input level, mute, unmute, stop, and cleanup without a third-party voice framework. The microphone track and ordered oai-events RTCDataChannel exist before createOffer, and only the resulting local description crosses the injected adapter.
- [ ] #4 The package exposes one discriminated state and event model for idle, permission, negotiating, connected, listening, muted, user level, agent speaking, recovering, stopping, stopped, and each terminal failure. Repeated start or stop, late events, device loss, ICE or SDP failure, data-channel timeout/error/close, adapter error, and transport disconnect settle deterministically and release every owned resource exactly once.
- [ ] #5 For WebRTC, the peer remote track is the only playback source and the realtime-events data channel owns open, message, error, close, and cleanup. The Archboard adapter maps the exact reviewed 0.151.0 thread/realtime methods and notifications into the package API; generated protocol types and unsupported outputAudio WebSocket behavior never cross the package boundary.
- [ ] #6 Strict TypeScript, Oxlint, Oxfmt, package-boundary checks, API extraction or type-surface fixtures, unit tests with controlled browser API fakes, and a real-browser contract test enforce every reachable transition, creation ordering, no-leak cleanup, no Archboard imports, and consumer use through only the public export map.
- [ ] #7 Package documentation defines lifecycle ownership, adapter obligations, browser support, autoplay and permission constraints, cleanup guarantees, error recovery, and a minimal framework-neutral consumer example. Reproducible build and test artifacts are generated on demand and remain ignored unless the repository records a reason to commit them.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create a private workspace package with a single public export map, strict browser-only TypeScript configuration, and no React, Archboard, Node, generated-protocol, or credential dependency.
2. Define the opaque thread-link, start-context, realtime adapter, command, state, event, and error contracts before implementing browser resources.
3. Implement the lifecycle state machine and idempotent ownership of getUserMedia tracks, peer connection, ordered data channel, AudioContext, AnalyserNode, and remote audio.
4. Implement start, mute, unmute, stop, device-loss, late-event, transport-loss, recovery, and cleanup behavior against injected browser factories.
5. Build the Archboard-side 0.151.0 realtime adapter separately so generated app-server types stop at the package boundary.
6. Add deterministic unit and browser contract tests for every transition, WebRTC creation order, playback source, and leak condition.
7. Add package-boundary and public-type checks, framework-neutral documentation and example, and production consumer verification through the export map only.
<!-- SECTION:PLAN:END -->
