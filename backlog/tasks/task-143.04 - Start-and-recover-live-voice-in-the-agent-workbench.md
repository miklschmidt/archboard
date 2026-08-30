---
id: TASK-143.04
title: Build the live voice UI and end-to-end recovery
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:46'
labels: []
dependencies:
  - TASK-143.02
  - TASK-143.03
  - TASK-143.06
  - TASK-143.07
references:
  - docs/design/operator-canvas-shell.md
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
Build the visible realtime voice experience around the standalone browser runtime and persistent coordinator linked to the focused pane and workhorse. The workbench owns start eligibility, permission and negotiation progress, compact live controls, transcript and context presentation, spoken-approval visibility, one-session enforcement, truthful recovery, and full resource cleanup. The browser runtime owns media mechanics; assistant-ui receives canonical coordinator timeline items; the app-server session remains the only Codex lifecycle authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Start voice is a named workbench action enabled only when the pane has a valid thread link to a controllable workhorse and persistent coordinator on the same child, exact 0.151.0 generated-schema conformance and app-server initialization succeeded, and model/list validates the configured coordinator model. Initialization does not claim that realtime V3 was accepted: the control stays Starting until thread/realtime/start succeeds and thread/realtime/started reports v3 for that exact coordinator, while rejection returns an actionable disabled compatibility state. Microphone permission is requested only from the user action.
- [ ] #2 Realtime start sends version v3, outputModality audio, WebRTC transport, includeStartupContext true, clientManagedHandoffs false, codexResponsesAsItems true, flushTranscriptTailOnSessionEnd true, prompt null, no unsupported rollout knobs, exact tracked start and end instructions, and a role-bearing semantic brief within the generated 128-item and 8,192-estimated-token limits.
- [ ] #3 The idle workbench shows microphone readiness, selected input device when the browser exposes it, configured coordinator model, and why Start voice is unavailable. Starting shows permission and negotiation progress. Active shows listening, muted, user-speaking level, agent-speaking, processing, awaiting approval, recovering, and stopping as explicit text states rather than an undifferentiated recording indicator.
- [ ] #4 The active voice transport is a compact persistent bar with Mute or Unmute and Stop always reachable, a restrained AnalyserNode level or waveform, remote playback sourced only from the WebRTC track, realtime-events data-channel state, source pane, coordinator, workhorse, effective service tier, and intervention policy. It follows the operator visual language and never displaces the canvas with a generic call screen.
- [ ] #5 Pane focus and exact selection are shown as live voice context. Focus, selection, and settled human or mixed-origin semantic changes reach the coordinator as developer-role realtime context without forcing speech; agent-only changes are excluded. Absent or ambiguous deictic context is visible as unavailable and causes clarification rather than a guessed board target.
- [ ] #6 Canonical partial transcript is visually provisional and final user and assistant transcript is committed once to the coordinator timeline. Delegation, queue, steer, approval, callback, and result chips cross-link to the separate workhorse timeline; typed composer turns stay on their originating thread. Stop flushes only the undelegated transcript tail to the coordinator.
- [ ] #7 Changing pane focus never retargets or hides the active session. An application-level indicator names its source pane, coordinator, and workhorse and keeps Stop reachable from either pane, collapsed workbench, and narrow layout. Rebinding or closing the source pane is refused while voice is starting, active, recovering, stopping, flushing its transcript tail, or while resulting coordinator work, dynamic calls, callbacks, or approvals remain unsettled. Only one application-wide voice session may occupy those states.
- [ ] #8 Spoken approval is shown only while voice is active, the single global spoken slot is awaiting_user, and the normal coordinator thread is free to classify a later delegated reply. The host plays the exact immutable description through appendSpeech and uses the expected session-scoped final assistant transcript sequence as the accepted 0.151.0 correlation boundary. A final user reply becomes a normal coordinator turn; only its typed resolve_spoken_approval call can accept or decline. Partial or ambiguous speech, realtime-model output, early or stale replies, coordinator-blocking requests, second requests, accept-for-session, and policy amendments cannot answer. Every presentation, resolution, expiry, race, and visual-only fallback remains visible and linked.
- [ ] #9 Permission denial, no device, removed device, device change, autoplay refusal, data-channel creation, open, error or close failure, SDP or ICE failure, realtime-start rejection or a started notification reporting a non-v3 version, coordinator-model rejection, app-server disconnect, realtime error, browser reconnect, collapse, fullscreen, and child exit each map to a named state with a next action. Cleanup closes tracks, audio nodes, peer connection, data channel, playback, timers, and subscriptions exactly once.
- [ ] #10 Same-child browser reconnect rehydrates the thread link, coordinator disclosure, canonical transcript, and session status without choosing another target. It may recover only where the realtime contract proves recovery safe; otherwise it presents a stopped or failed state and an explicit restart. Child exit invalidates all three identities and never auto-resumes against a replacement.
- [ ] #11 All voice controls are keyboard operable, visibly focused, screen-reader named, and usable at 420 pixels, in both themes, one and two panes, expanded and collapsed workbench, and fullscreen. Listening, speaking, muted, reconnecting, and error states have equivalent text and are not conveyed by waveform, animation, or color alone; reduced motion removes nonessential animation.
- [ ] #12 A deterministic real-browser lane uses controlled media, peer, audio, data-channel, transcript, semantic-context, callback, spoken-gate, and app-server fakes to prove negotiation order, every visible state, transcript de-duplication, one-session exclusion, pane-switch persistence, appendSpeech description sequencing, coordinator-thread delegation and typed verdict, coordinator-blocked visual fallback, second-request refusal, every compare-and-swap expiry race, same-child reconnect, and complete cleanup. A manual clean-process microphone and speaker smoke against the exact 0.151.0 binary and dedicated signed-in home proves real audio, coordinator lookup, one direct board write, busy-workhorse queueing, callback speech, one eligible spoken approval, stop, restart, and shutdown.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the voice presentation state adapter that consumes only TASK-143.02 browser-runtime events and TASK-143.07 coordinator state; keep media and app-server protocol objects outside React components.
2. Add the idle Start voice affordance and preflight explanation for thread link, coordinator, model, experimental capability, microphone availability, and one-session exclusion.
3. Build explicit permission and WebRTC negotiation progress, then the compact persistent active transport with Mute or Unmute, Stop, text state, source identities, effective settings, and restrained analyser visualization.
4. Render live focus, exact selection, semantic-context freshness, and ambiguity state so the person can see what deictic voice input will mean.
5. Map provisional and canonical transcript events into the coordinator timeline without duplication and add cross-links for delegation, queue, steer, approval, callback, and workhorse results.
6. Keep the active transport reachable across pane focus changes, collapse, narrow layout, and fullscreen while refusing close or rebind of the source thread link.
7. Add the visual half of contextual spoken approval, including exact request summary, model-classification warning, one-time decision, expiry, and visual-only session or policy choices.
8. Model every device, browser, WebRTC, realtime, app-server, coordinator, reconnect, and child-exit outcome as a named recoverable or terminal UI state with one next action.
9. Guarantee idempotent resource cleanup and truthful same-child reconnect behavior through the runtime boundary.
10. Exercise the full UI state matrix with deterministic browser fakes, accessibility checks, and both responsive themes, then run the clean-process real microphone and speaker smoke against the configured Codex binary.
<!-- SECTION:PLAN:END -->
