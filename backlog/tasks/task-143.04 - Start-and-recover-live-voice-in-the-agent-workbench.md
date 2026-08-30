---
id: TASK-143.04
title: Start and recover live voice in the agent workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:19'
labels: []
dependencies:
  - TASK-143.02
  - TASK-143.03
  - TASK-143.06
  - TASK-143.07
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the internal browser-native realtime module with the persistent fast coordinator linked to the focused pane's controllable workhorse. Voice starts realtime V3 on the coordinator task, supplies exact Archboard role instructions and a fresh semantic board brief, streams focus, selection, and settled human changes into that session, renders its lifecycle and linked transcript, and proves the browser to owned app-server to WebRTC path. Voice neither creates nor retargets a workhorse implicitly, and only one live channel may run in the application.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Start voice is enabled only when the pane has a controllable workhorse and a valid linked coordinator on the same dedicated child, experimentalApi and realtime V3 were accepted, and the configured coordinator model is available. It asks for microphone access only from the user action and binds thread/realtime/start and SDP negotiation to that exact coordinator thread
- [ ] #2 Realtime start sends version v3, outputModality audio, WebRTC transport, includeStartupContext true, clientManagedHandoffs false, codexResponsesAsItems true, flushTranscriptTailOnSessionEnd true, prompt null, and no unsupported rollout knobs. realtimeStartInstructions and realtimeEndInstructions each equal the exact UTF-8 voice-coordinator-instructions.md content; role-bearing initialItems contain the semantic brief naming repository, workhorse, coordinator, board, pane, board version, focused selection, claim, doing state, latest change cursor, and a compact board description within the generated 128-item and 8,192-estimated-token limits
- [ ] #3 While active, pane focus and selection updates and settled human or mixed-origin semantic board changes reach the coordinator as developer-role realtime context without forcing speech; agent-only changes are excluded. Singular exact selection resolves deictic references, while absent or ambiguous this, that, or there context makes the coordinator ask rather than guess
- [ ] #4 The workbench exposes start, mute, unmute, and stop with visible listening and agent-speaking state, a restrained live level or waveform from AnalyserNode, remote playback only from the WebRTC track, visible realtime-events data-channel negotiation state, coordinator model and service tier, effective intervention policy, and equivalent text status for screen readers
- [ ] #5 Canonical partial and final user and assistant transcript events persist only in the coordinator task timeline without duplication. Delegation, queue, steer, callback, approval, and result links lead to the separate workhorse timeline; typed composer turns remain on their originating task. Stopping voice flushes an undelegated transcript tail to the coordinator only and never starts workhorse work without an explicit request
- [ ] #6 Changing pane focus never retargets or hides an active session: a persistent indicator names its source pane, coordinator, and workhorse and keeps Stop reachable. Rebinding or closing the source pane is refused until voice stops. Only one application-wide voice session can be starting, active, recovering, or stopping
- [ ] #7 Permission denial, no device, removed device, autoplay refusal, data-channel creation or open failure, data-channel error or close, SDP or ICE failure, V3 rejection, coordinator-model rejection, app-server disconnect, realtime error, collapse, fullscreen, and browser reconnect each produce a truthful recoverable state and release media resources. Same-child browser reconnect rehydrates without retargeting; child exit invalidates workhorse, coordinator, and voice ownership and cannot auto-resume on a replacement
- [ ] #8 The accepted spoken approval flow is available only during an active coordinator session: after the coordinator describes the exact pending request, a contextual final user affirmation may send one-time accept and a final decline may reject. Partial transcripts, assistant speech, stale or resolved requests, accept-for-session, and policy amendments cannot answer the request; every outcome is visible and linked
- [ ] #9 A deterministic browser lane uses controlled media, peer, data-channel, transcript, context, and app-server fakes to prove WebRTC ordering, startup brief limits, live selection and semantic deltas, tail flush to coordinator only, linked timelines, contextual one-time approval, every lifecycle state, and cleanup. A manual microphone and speaker check against the dedicated exact-binary app-server proves real audio, coordinator lookup, one direct board write, busy-workhorse queueing, callback speech, transcript, stop, and restart
- [ ] #10 The live smoke starts from a clean Archboard process, reports the configured Codex version and dedicated child identity, verifies coordinator model and priority or visible standard fallback, survives same-child browser reconnect, and proves stopping Archboard closes realtime, media, coordinator session state, and app-server resources without a Desktop, shared daemon, MCP child, or private host socket
<!-- AC:END -->
