---
id: TASK-143.04.01
title: Project realtime lifecycle into voice UI state
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 09:31'
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
2. Ports: VoiceRealtimePort (snapshot/state/start/stop) satisfied structurally by the already-constructed BrowserWorkbenchMediaOwner, and VoiceTransportPort (state/snapshot/capabilities/captureCommandTarget/subscribe) satisfied by BrowserWorkbenchTransport. The module constructs neither owner and mints no correlation, so start/stop stay parameterless delegations.
3. lib/projection.ts: one pure total function from (RealtimeMediaSnapshot|null, BrowserWorkbenchMediaState, BrowserWorkbenchState, BrowserSnapshot|null, BrowserWorkbenchCapabilities, captured binding, replacement verdict) to VoiceSessionView. Phase+reason drive the status (recovery_requested and host voice recovering give 'recovering'); recoverable_error gives a retry outcome, terminal_error a terminal one, stop_failed a retry that names Stop so the codex-realtime stop/closed serialization is honoured.
4. lib/session.ts: createVoiceSession keeps one binding captured at the first start from captureCommandTarget plus coordinator.threadId, holds it across focus changes and reconnects (an absent snapshot is not a replacement), refuses a second start while a session is live, marks a changed child/epoch/thread/coordinator/pane as a terminal replacement that only close() clears, and runs start/stop/restart through a generation counter so a superseded control resolution is discarded. restart() stops, requires phase closed, and only then starts. dispose() releases the transport subscription and refuses further controls without disposing the media owner it does not own.
5. lib/use-voice-session.ts: a thin useSyncExternalStore hook over the adapter's own subscribe/view. No assistant-ui import, no JSX, no component.
6. Tests under src/ui/voice-session/tests, each under the 500-line cap: projection-mapping.test.ts walks REALTIME_PHASES and REALTIME_TRANSITIONS to prove every reachable (phase, reason) maps to a distinct defined status, failure code and non-empty accessible sentence; session-lifecycle.test.ts covers same-child reconnect, replacement terminal state, late-resolution suppression, start/stop/restart serialization and disposal; adapter-boundaries.test.ts proves the module reduces no protocol events, exposes no transcript, owns no media API and chooses no recovery on its own (behavioural spies plus a static source scan).
7. Verify: bun run type-check, lint, fmt:check, build:frontend, bun test --isolate over the four UI modules, bun run test:repository, bun run test:modules.
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
<!-- SECTION:NOTES:END -->
