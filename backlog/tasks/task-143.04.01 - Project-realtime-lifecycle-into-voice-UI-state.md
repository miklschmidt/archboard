---
id: TASK-143.04.01
title: Project realtime lifecycle into voice UI state
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 10:27'
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
  - src/ui/codex-workbench-media
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
- [x] #1 Presentation covers unavailable, ready, permission, negotiating, listening, muted, processing, agent-speaking, recovering, stopping, stopped, permission/device/ICE/SDP/channel/realtime/app-server/coordinator failure, and actionable retry/terminal outcomes.
- [x] #2 One session remains bound to its original pane/thread link/coordinator across focus changes; close/rebind guards are explicit, no second session starts, and restart follows codex-realtime stop/closed serialization.
- [x] #3 The adapter never reduces protocol events, deduplicates transcripts, owns media, or chooses recovery; it projects the authoritative module/host-adapter state only.
- [x] #4 Tests at src/ui/voice-session/tests exhaust mapping, same-child reconnect, replacement terminal state, late suppression, start/stop/restart, accessibility status text, and disposal.
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

9. Round-two remediation: the meter is not a status field. The realtime level publishes from an animation frame, so VoiceSessionView drops inputLevel and the adapter exposes level()/subscribeLevel() with a useVoiceLevel hook; a level-only frame is recognised by the identity of the module's frozen state and correlation objects and skips the projection entirely, and the status view is compared field-wise instead of by JSON.stringify.
10. A projection is a read. captureCommandTarget is removed from VoiceTransportPort because it is a lease operation, not a read: child, epoch, workhorse and coordinator come from the published snapshot, and the pane is a plain id the caller supplies to createVoiceSession. The pane comparison is unconditional, and the readiness check is hoisted above the link read so a stale snapshot never condemns a binding.
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

Round-two review remediation (c43dcb30), after rebasing onto codex/task-143-144-workbench at badb5a60 and re-running bun install for the landed DOM stack.

A (MEDIUM, meter on the status path). inputLevel is gone from VoiceSessionView. The adapter now has level() and subscribeLevel(), and lib/use-voice-session.ts adds useVoiceLevel, so a meter animating at sixty frames a second re-renders the meter and nothing else. A level-only frame is recognised structurally rather than guessed: createRealtimeMediaSession reuses the same frozen state and correlation objects when only the level moves, so republish() compares those identities plus the media-owner and transport state identities and, on a match, updates the level and returns without projecting. JSON.stringify is gone; the status view is compared field-wise by sameView/sameFailure/sameOutcome/sameControls/sameBinding. Owners in tests/notification-lifecycle.test.ts: 'keeps sixty meter frames off every status subscriber' asserts 60 level notifications, zero status notifications, the same memoized view object, and exactly 60 transport reads across the 60 frames (one identity check each, where a re-projection would read state, capabilities and the link); 'publishes the level alongside a status change that carries one' proves a real status move still publishes both.

B (MEDIUM, a read that wrote). captureCommandTarget is removed from VoiceTransportPort altogether, so the adapter cannot reach the lease surface from a projection even by accident. On the real transport that call runs captureLease, which expires and renews currentLease and calls notify() before it can throw, so a projection was writing and re-entering the transport broadcast and this adapter's publish at meter rate. observeBinding and captureBinding now read childId, epoch and threadId from the published snapshot.threadLink and the coordinator from snapshot.coordinator. Owner: 'never reaches for the lease surface while projecting' drives a start, a transport delta, a phase change, 30 meter frames, a refresh and a stop, and asserts the fake's captureCommandTarget counter is still zero. The fake keeps that method although the port no longer declares it, precisely so the counter can be asserted.

C (LOW, the pane guard). The pane is now a plain paneId on VoiceSessionPorts, supplied once by the caller that owns the pane, and bindingReplaced compares it unconditionally — no throw is swallowed and no comparison is skipped. Honest limitation to record: with a constructor-supplied constant both sides are the same value within one adapter, so this is an invariant (a binding is never presented under a pane it was not captured for) rather than a live signal. The live pane axis was exactly what captureCommandTarget provided, and finding B removed it deliberately; if a live pane signal is wanted later it must come from a published snapshot field, not a lease call. Owner: 'keeps the caller's pane on the binding across start and restart' also proves two adapters over one workbench keep distinct panes. The old 'pane' case in the replacement matrix is dropped because setPaneId no longer influences the adapter.

D (LOW, stale snapshot). observeBinding returns null before it reads the link unless state.kind === 'readiness'. Owner: 'a stale snapshot naming another child never condemns the binding' sets a stream/stale_snapshot projection carrying child-b/epoch-b/workhorse-b, asserts the session stays listening with its original binding and no failure, then sets the same identities on a readiness projection and asserts the replacement does fire.

Test files after splitting the ordering and disposal cases into tests/notification-lifecycle.test.ts and hoisting the shared harness into tests/support/harness.ts: adapter-boundaries 163, availability-mapping 284, notification-lifecycle 148, projection-mapping 241, session-lifecycle 280, support/fakes 288, support/harness 65. All well under the 500-line cap.

Re-verification, all green: type-check exit 0; lint exit 0; fmt:check 1071 files correct; build:frontend exit 0; bun test --isolate over voice-session + codex-realtime + codex-workbench-media + workbench-transport = 179 pass / 0 fail / 4737 expect across 16 files; bun test --isolate src/ui/codex-workbench-media = 8 pass / 0 fail; test:repository = 122 pass / 0 fail across 18 files; test:modules = 2011 pass / 0 fail across 226 files.

Round-three remediation (52f62b11) and finalization.

Independent fixed-range review of badb5a60..c7967834 returned CLEAN apart from the transport-channel gate, fixed in 52f62b11.

MEDIUM (transport-channel gate). The level-only identity gate was registered on both ports. It compares the transport's state object, but a projection also reads capabilities(), which the real transport rebuilds on every call and moves on lease claim, renewal, release and expiry without touching that state object, so a capabilities-only notification matched the gate and published nothing while refresh() showed canRestart had flipped. It was latent only because startBlocker reads the snapshot-derived canClaimLease today; TASK-143.04.02 will naturally read canRealtime or canCommand. The gate now belongs to realtime.subscribe alone — the only channel that repeats itself — and transport.subscribe always projects in full. Owner: tests/notification-lifecycle.test.ts 'republishes on a capabilities-only transport notification'. Confirmed non-vacuous: reverting the transport channel to the gated callback fails it with 3 notifications instead of 4.

Corrected line count from the previous note: session-lifecycle.test.ts is 279 lines, not 280. Current test files: adapter-boundaries 163, availability-mapping 284, notification-lifecycle 164, projection-mapping 241, session-lifecycle 279, support/fakes 288, support/harness 65. All well under the 500-line cap.

HAND-OFF for TASK-143.04.06: the pane guarantee rests on constructing one voice session per pane and never reusing one across panes; no runtime check remains. createVoiceSession takes paneId as a plain constructor value, and bindingReplaced compares it unconditionally, but within one adapter both sides are that same constant, so the comparison is an invariant rather than a live signal. The live pane axis was transport.captureCommandTarget(), removed deliberately because it is a lease operation that expires and renews the lease and broadcasts before it can refuse — calling it from a projection wrote from inside a documented pure read. A live pane signal, if one is wanted, must come from a published snapshot field.

INTERFACE GAP (restated): voice-session exposes no mute or unmute control because nothing in the browser could reach the module's 'muted' phase — createRealtimeMediaSession never drives it and the media owner published no mute command. TASK-143.04.02 is implementing mute as a sibling edit; voice-session already presents the 'muted' status the moment the module publishes that phase, so no change is needed here to consume it.

Final verification, all green: bun run type-check exit 0 (both tsconfig projects); bun run lint exit 0 (oxlint .); bun run fmt:check 1071 files correct; bun run build:frontend exit 0; bun test --isolate over voice-session + codex-realtime + codex-workbench-media + workbench-transport = 180 pass / 0 fail / 4741 expect across 16 files; bun run test:repository = 122 pass / 0 fail / 1060 expect across 18 files (the codex-realtime neutral-contract, dependency and boundary owners stay green).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built src/ui/voice-session, the React-facing presentation adapter that turns authoritative realtime, media-owner and transport state into render-ready voice values: a 12-state status enum, an accessible status sentence, a retry/terminal outcome, and control availability. No media, protocol or transport object crosses its contract; the microphone level has its own channel so a sixty-frame meter never re-renders a status consumer.

AC #1 is proved by tests/projection-mapping.test.ts, which derives every reachable realtime state from REALTIME_PHASES and REALTIME_TRANSITIONS rather than a hand-kept list and requires each to map to a defined status, label, sentence and accessible string, plus a distinct presentation code for all 14 recoverable and all 4 terminal reasons carrying the module's message verbatim; tests/availability-mapping.test.ts owns the transport, media and host gates, a mid-run host coordinator or voice failure, a host-declared recovery, and a stale snapshot. AC #2 is proved by tests/session-lifecycle.test.ts: the binding survives a reconnect returning the same child, a retained snapshot with no executable link, and a stale snapshot naming another child, while a changed child, epoch, thread link or coordinator is terminal until close() clears it; no second start while a session is live; restart awaits the codex-realtime stop and starts only on phase closed, and an unconfirmed stop presents as terminal because the module refuses every later start on that run. AC #3 is proved by tests/adapter-boundaries.test.ts, which pins the real owners to the declared ports at compile time, rejects every media, protocol, transcript and owner-construction identifier in the module's own source, shows no nested object escapes the view, and shows a recoverable failure drives nothing until the person presses. AC #4's remaining subjects are proved by tests/notification-lifecycle.test.ts: late-resolution suppression, sixty meter frames costing zero status notifications, a capabilities-only transport notification republishing, and disposal releasing both subscriptions.

One serialized sibling edit was required and is included: src/ui/codex-workbench-media created the realtime media session and discarded its subscription, so a removed microphone, a dropped ICE connection, a closed data channel and every in-start phase reached nobody. BrowserWorkbenchMediaOwner now has subscribe, forwarding those publications and every owner-state write, released on run replacement and disposal, with its own owner in that module's tests.

Verified with bun run type-check (exit 0, both tsconfig projects), bun run lint (exit 0), bun run fmt:check (1071 files), bun run build:frontend (exit 0), bun test --isolate over voice-session, codex-realtime, codex-workbench-media and workbench-transport (180 pass, 0 fail, 4741 assertions across 16 files), and bun run test:repository (122 pass, 0 fail across 18 files). Three independent fixed-range reviews were remediated in place; the last returned clean apart from the transport-channel gate, fixed in 52f62b11.
<!-- SECTION:FINAL_SUMMARY:END -->
