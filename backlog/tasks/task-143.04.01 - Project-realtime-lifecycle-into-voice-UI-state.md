---
id: TASK-143.04.01
title: Project realtime lifecycle into voice UI state
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 09:49'
labels: []
dependencies:
  - TASK-143.02.02
  - TASK-143.02.03
  - TASK-143.03.01
  - TASK-143.07.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-session
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the React-facing presentation adapter in src/ui/voice-session. It consumes only the public browser-native module state, the sole codex-realtime binding phase, and closed coordinator/session capabilities and exposes render-ready values without media/protocol objects. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Presentation covers unavailable, ready, permission, negotiating, listening, muted, processing, agent-speaking, recovering, stopping, stopped, permission/device/ICE/SDP/channel/realtime/app-server/coordinator failure, and actionable retry/terminal outcomes.
- [ ] #2 One session remains bound to its original pane/thread link/coordinator across focus changes; close/rebind guards are explicit, no second session starts, and restart follows codex-realtime stop/closed serialization.
- [ ] #3 The adapter never reduces protocol events, deduplicates transcripts, owns media, or chooses recovery; it projects the authoritative module/host-adapter state only.
- [ ] #4 Tests at src/ui/voice-session/tests exhaust mapping, same-child reconnect, replacement terminal state, late suppression, start/stop/restart, accessibility status text, and disposal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Public contract (src/ui/voice-session/contract.ts): VoiceSessionStatus enum covering unavailable/ready/requesting_permission/negotiating/listening/muted/processing/agent_speaking/recovering/stopping/stopped/failed; VoiceSessionFailure with a presentation code per RealtimeRecoverableErrorReason, RealtimeTerminalErrorReason and the two adapter-owned codes (replaced, host_voice); VoiceSessionOutcome as none|retry(control)|terminal; VoiceSessionControls (canStart/canStop/canRestart/canClose); VoiceSessionBinding of plain strings (paneId, childId, epoch, workhorseThreadId, coordinatorThreadId); VoiceSessionView with label, detail, accessibleStatus, inputLevel and a plain-string sessionId. No media, protocol, transport or React types cross the contract.
2. Ports: VoiceRealtimePort (snapshot/state/subscribe/start/stop) satisfied structurally by the already-constructed BrowserWorkbenchMediaOwner, and VoiceTransportPort (state/snapshot/capabilities/captureCommandTarget/subscribe) satisfied by BrowserWorkbenchTransport. The module constructs neither owner and mints no correlation, so start/stop stay parameterless delegations. A module test pins both real owners to those ports at compile time.
3. Serialized sibling-module edit (src/ui/codex-workbench-media): the owner created the realtime media session and discarded its subscription, so every browser-originated change reached nobody. Add BrowserWorkbenchMediaOwner.subscribe, forwarding the inner session's publications and every owner-state write, released on run replacement and disposal. That channel, not polling, is how voice-session sees a lost microphone, a dropped ICE connection, a closed data channel, and the in-start phases.
4. lib/projection.ts: one pure total function from (RealtimeMediaSnapshot|null, BrowserWorkbenchMediaState, BrowserWorkbenchState, captured binding, replacement verdict, busy/closed, control failure) to VoiceSessionView. Phase+reason drive the status; a host-declared recovery renames a live run to recovering; a coordinator or voice failure the host publishes mid-run is visible on a healthy run, not just a control gate. Host coordinator and voice states are matched by satisfies-checked tables over the published unions. A stale snapshot blocks a start. recoverable_error offers restart, or stop when the workbench is not currently startable; terminal_error offers close; stop_failed is TERMINAL, because createRealtimeMediaSession makes stop() a no-op and refuses every later start on a run whose stop the host never confirmed.
5. lib/session.ts: createVoiceSession keeps one binding captured at the first start from captureCommandTarget plus coordinator.threadId, holds it across focus changes and reconnects (an absent or stale snapshot is not a replacement), refuses a second start while a session is live, marks a changed child/epoch/thread/coordinator/pane as a terminal replacement that only close() clears, and runs start/stop/restart/close through a generation counter so a superseded control resolution is discarded. restart() stops, requires phase closed, and only then starts. close() awaits realtime.stop() before retiring the binding so nothing is left holding the microphone. dispose() releases both subscriptions and refuses further controls without disposing the owners it reads.
6. lib/use-voice-session.ts: a thin useSyncExternalStore hook over the adapter's own subscribe/view. No assistant-ui import, no JSX, no component.
7. Tests under src/ui/voice-session/tests, each well under the 500-line cap: projection-mapping walks REALTIME_PHASES and REALTIME_TRANSITIONS to prove every reachable (phase, reason) maps to a defined status, failure code and non-empty accessible sentence; availability-mapping owns the transport, media and host gates, the mid-run host failure, the host-declared recovery and the stale snapshot; session-lifecycle covers same-child reconnect, replacement terminal state, late-resolution suppression, start/stop/restart serialization, the media-owner push and disposal; adapter-boundaries proves the module reduces no protocol events, exposes no transcript, owns no media API, chooses no recovery, and declares ports the real owners satisfy. One owner in src/ui/codex-workbench-media/tests proves the forwarded subscription and its release.
8. Verify: bun run type-check, lint, fmt:check, build:frontend, bun test --isolate over the five UI modules, bun run test:repository, bun run test:modules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1 (cd20c279): src/ui/voice-session contract.ts, lib/failure.ts, lib/narration.ts, lib/projection.ts, lib/session.ts, lib/use-voice-session.ts, index.ts.

Decisions recorded here rather than asked:
- Ports, not owners. VoiceRealtimePort is {snapshot,state,start,stop}, satisfied structurally by the already-constructed BrowserWorkbenchMediaOwner, and VoiceTransportPort is {state,snapshot,capabilities,captureCommandTarget,subscribe}, satisfied by BrowserWorkbenchTransport. start/stop take no arguments precisely because minting a realtime correlation is media work; the module constructs and disposes neither owner.
- Notification comes from transport.subscribe plus the adapter's own control resolutions, with an explicit refresh(). The media owner publishes no subscription of its own today (codex-workbench-media stubs onSemanticEvent), so this is the whole authoritative channel available to a presentation adapter; adding one belongs to that module, not this one.
- 'recovering' and 'agent_speaking' are presentation names. codex-realtime has no recovering phase: a permission or negotiation phase re-entered for reason 'recovery_requested' is what a recovery is, so the mapping is keyed by (phase, reason), not phase alone.
- stop_failed presents as terminal, not as a retry. createRealtimeMediaSession makes stop() a no-op and refuses every later start on a run whose stop the host never confirmed, so offering a restart there would offer something the module rejects. Every other recoverable reason offers restart, or stop when the workbench is not currently startable.
- Failure codes cover all 14 recoverable and all 4 terminal realtime reasons via satisfies-checked tables, plus two adapter-owned codes: 'replaced' (binding moved) and 'host_voice' (the host published a failed voice or coordinator projection).
- close() retires exactly the session it was called on (closedSessionId), so a later run started by the media owner still shows.

Slice 2 (ec8a4a5b): src/ui/voice-session/tests/{projection-mapping.test.ts, session-lifecycle.test.ts, adapter-boundaries.test.ts, support/fakes.ts}. Discovered by test:modules through the existing 'src' selector; no inventory or package.json edit.

Test decisions:
- Exhaustiveness is derived, not listed. reachableStates() walks REALTIME_PHASES x REALTIME_TRANSITIONS plus INITIAL_REALTIME_STATE, so a reason added to the neutral host contract fails this owner rather than passing unnoticed. The status set assertion is computed from VOICE_SESSION_STATUSES minus 'unavailable' for the same reason.
- The 'detail ends with a period' assertion applies only to narrated sentences. A failure detail carries the module's authoritative message and is asserted to end with it verbatim instead, because the adapter must not repunctuate what the module said.
- A separate case asserts no projected retry ever names a control the same projection disabled, across every reachable state plus the reconnecting, attaching, replaced, and busy inputs.
- AC #3 has both a behavioural and a static owner: a recoverable failure leaves realtime.calls() empty until the person presses, and a source scan rejects getUserMedia, RTCPeerConnection, MediaStream, AudioContext, createDataChannel, set{Local,Remote}Description, createOffer, attachRemoteMedia, onSemanticEvent, appendText, appendSpeech, transcript, transitionRealtimeState, the two owner constructors, and @assistant-ui, plus an import allow-list of module-root entrypoints only.

Verification from the worktree, all green: type-check exit 0 (both tsconfig projects); lint exit 0 (oxlint .); fmt:check 1066 files correct; build:frontend built in 428ms; bun test --isolate over voice-session + codex-realtime + codex-workbench-media + workbench-transport = 169 pass / 0 fail / 4708 expect across 14 files; test:repository = 122 pass / 0 fail across 18 files (codex-realtime neutral-contract and boundary owners included); test:modules = 2000 pass / 0 fail across 223 files. Every test file is under the 500-line cap (largest is projection-mapping.test.ts at 403).

Deliberately out of scope: no rendered control or component (TASK-143.04.02 owns the persistent controls and the aesthetics guide), no transcript projection (TASK-143.04.04), no captured-context panel (TASK-143.04.03), no spoken-approval presentation (TASK-143.04.05), and no shell wiring (TASK-143.04.06). The module ships a hook, useVoiceSession, but no JSX.

Review remediation (95dfd485, a790c378). Findings 1-9 addressed; finding 10 left alone by instruction.

1 (HIGH, sibling-module edit — recorded deliberately). src/ui/codex-workbench-media created the realtime media session and discarded its subscription, so every browser-originated change reached nobody: device_lost, ice_disconnected, data_channel_closed, remote_media_failed and every in-start phase publish only to RealtimeMediaSession.subscribe. Added BrowserWorkbenchMediaOwner.subscribe, forwarding those publications plus every owner-state write (all owner-state writes now go through one setter so none is silent), released when a run is replaced or closed, and refusing new subscribers once disposed. VoiceRealtimePort gained subscribe and createVoiceSession registers on it; refresh() is an escape hatch again. New owner 'forwards realtime publications to subscribers and releases them with each run' in src/ui/codex-workbench-media/tests/media-owner.test.ts; new voice-session owner 'sees a browser-originated realtime change with no transport delta'; the three tests that leaned on refresh() now observe the push.
2. A host coordinator or voice failure arriving mid-run is now attached to the healthy runView with a visible sentence and an offered control, not just a control gate. Owner: 'shows a host coordinator failure that arrives while a run is healthy'.
3. close() now awaits realtime.stop() before retiring the binding, so a replaced or terminal session cannot leave a live capture behind a UI that says it is over. Owners: 'only close() clears a replacement...' asserts the stop, 'close() is refused while the session is usable' asserts none.
4. adapter-boundaries 'declares ports the real owners already satisfy' assigns BrowserWorkbenchMediaOwner and BrowserWorkbenchTransport to the two ports through module-root type-only imports, so owner drift is a compile error.
5. A stale_snapshot (kind 'stream') now blocks a start with its own reason and no longer condemns a binding: observeBinding treats only a readiness projection as evidence about the link. Owner: 'treats a stale snapshot as unable to anchor a start'.
6. Host coordinator and voice states are matched by satisfies-checked tables (COORDINATOR_BLOCKERS, VOICE_BLOCKERS) over the published unions instead of by negation, and a host-declared recovery renames a live run to recovering as the plan said. Owner: 'renames a live run to recovering while the host says it is recovering'.
7. Dropped the module-root import allow-list and the @assistant-ui subject from adapter-boundaries; oxlint's moduleEntrypoints rule and tests/system/repository-policy/assistant-ui-imports.test.ts already own them. The media/transcript/owner-constructor scan stays.
8. INTERFACE GAP for TASK-143.04.02: there is no mute or unmute in this control surface, because there is none to project. codex-realtime has a 'muted' phase with mute_requested/unmute_requested transitions, but createRealtimeMediaSession never drives it and BrowserWorkbenchMediaOwner exposes no mute command, so nothing in the browser can enter or leave that phase today. voice-session already presents 'muted' if the module ever publishes it. Making mute reachable means adding a command to codex-realtime and codex-workbench-media first; .04.02 must not assume a mute control exists.
9. Fixed the misleading 'the person closes the session' comment on the late-resolution owner (it disposes). Plan replaced to match shipped behaviour. Corrected file lengths after the split: adapter-boundaries 167, availability-mapping 284, projection-mapping 241, session-lifecycle 376, support/fakes 270; codex-workbench-media/tests/media-owner.test.ts 470. All under the 500-line cap.

Re-verification, all green: type-check exit 0; lint exit 0; fmt:check 1067 files correct; build:frontend exit 0; bun test --isolate over voice-session + codex-realtime + codex-workbench-media + workbench-transport = 174 pass / 0 fail / 4724 expect across 15 files; bun test --isolate src/ui/codex-workbench-media = 8 pass / 0 fail; test:repository = 122 pass / 0 fail across 18 files; test:modules = 2005 pass / 0 fail across 224 files.
<!-- SECTION:NOTES:END -->
