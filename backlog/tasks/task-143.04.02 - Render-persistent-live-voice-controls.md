---
id: TASK-143.04.02
title: Render persistent live voice controls
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 11:04'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-controls
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Start, Mute/Unmute, Stop, permission/negotiation progress, audio level, and persistent active transport in `src/ui/voice-controls`. It emits commands through the voice-session adapter and owns no media resources.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Controls render unavailable, ready, requesting permission, negotiating, listening, muted, processing, agent-speaking, recovering, stopping, stopped, retryable failure, and terminal failure with exact bound identity.
- [ ] #2 Start, mute/unmute, retry when permitted, and Stop emit only explicit presentation-adapter commands; pending/repeated/late input is disabled with an actionable reason.
- [ ] #3 Level/waveform visualization is supplemental to named status, respects reduced motion, never animates after stop, and never exposes raw media objects.
- [ ] #4 Tests at src/ui/voice-controls/tests cover keyboard/pointer/touch, visible focus, labels/status, color independence, both themes, Samsung Flip targets, failure recovery, and disposal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mute path, layer 1 (sibling edit, src/ui/codex-realtime). The frozen RealtimeHost interface (createOffer/attachRemoteMedia/onSemanticEvent/appendText/appendSpeech/stop/recover) has no mute, and it does not need one: muting is toggling the captured local audio track's `enabled`, which is browser-native and sends no host command and forces no renegotiation. Add `mute()`/`unmute()` to RealtimeMediaSession: toggle every local audio track, then publish `muted`/`mute_requested` or `listening`/`unmute_requested` through the existing `publish`, which the state machine already allows from exactly listening and muted. No new module export name, so the frozen export surface in tests/public-api.test.ts is unchanged; the neutral-contract owner constrains identity brands and runtime-to-UI imports, neither of which moves.
2. Mute path, layer 2 (sibling edit, src/ui/codex-workbench-media). BrowserWorkbenchMediaOwner gains `mute()`/`unmute()` forwarding to the active run's realtime session and refusing when none is active, the same shape as `stop()`. No lease claim and no command: a local track toggle is not a wire operation. The owner's existing forwarded subscription publishes the phase change.
3. Mute path, layer 3 (sibling edit, src/ui/voice-session). VoiceRealtimePort gains mute/unmute; VoiceSessionControls gains canMute/canUnmute (listening and muted respectively, both gated on !busy like start/stop); VoiceSession gains mute()/unmute() running through the same generation/busy discipline as start/stop. No change to the subscription wiring.
4. src/ui/voice-controls/contract.ts: VOICE_CONTROL_STATES as the thirteen AC #1 states — the twelve VoiceSessionStatus values with 'failed' split into retryable_failure and terminal_failure by the projected outcome kind. VoiceControlCommand is exactly the adapter's method names (start/mute/unmute/stop/restart/close). VoiceControlAction carries command, label, accessibleLabel, enabled and, when disabled, an actionable reason. VoiceControlsView carries state, label, detail, accessibleStatus, failure text, actions, the persistent transport indicator (feature name from REALTIME_MEDIA_FEATURE plus the bound pane/child/epoch/workhorse/coordinator identity and sessionId), and whether a level meter may run.
5. lib/projection.ts: one pure total map from (VoiceSessionView, pending command | null) to VoiceControlsView. Pending is the component's own dispatch state, not a second source of voice state: while a command this component sent is unsettled every action is disabled with 'A voice command is already running…', which is what makes repeated and late input inert alongside the adapter's own refusal. A disabled action always names why in product words. The meter is allowed only in the live statuses (listening, muted, processing, agent_speaking, recovering), so it can never animate after stop, stopped, or a failure.
6. lib/VoiceControls.tsx: named status text and the transport indicator are always rendered; commands go through @/ui/button and the adapter methods only. One pending state, cleared by the resolved promise and ignored after unmount through a generation ref, so a late resolution cannot re-enable a disposed session's controls. lib/VoiceLevelMeter.tsx subscribes useVoiceLevel only while the projection allows a meter and reduced motion is not requested; the bar's transition uses duration-control/ease-control so the canonical theme's reduced-motion collapse is the only motion owner. A module-local typed glyph map gives every state an icon beside its text, because the shell icon set has no microphone marks and src/ui/shell is out of scope.
7. Tests under src/ui/voice-controls/tests, each well under 500 lines. Views are built by calling the real projectVoiceSession over real realtime/host state rather than hand-written fixtures, so a state that stops being reachable fails the owner. Mounted on src/ui/dom-testing where interaction matters: keyboard/pointer/touch activation, visible focus, disabled-with-reason for pending/repeated/late input, failure recovery, disposal. Pure renderToStaticMarkup for the thirteen states, labels/status text, color independence (text plus glyph per state), token-only class strings in both themes, and the 44px touch-target classes.
8. Verify: type-check, lint, fmt:check, build:frontend, bun test --isolate over voice-controls, voice-session, codex-realtime, codex-workbench-media and dom-testing, test:repository, the codex-realtime process contract, and test:modules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebased onto codex/task-143-144-workbench at 57c677f6 before the first commit (my base commits were patch-identical and dropped), then re-ran bun install. The report's log range is therefore 57c677f6..HEAD, not c7967834..HEAD.

MUTE DECISION, and what it cost at each layer. The frozen host interface (RealtimeHost: createOffer, attachRemoteMedia, onSemanticEvent, appendText, appendSpeech, stop, recover) has no mute and does not need one: silencing the microphone is toggling the captured local audio track's browser-native `enabled` flag, which sends the realtime host nothing and renegotiates nothing. The neutral-contract owner (tests/system/repository-policy/codex-realtime-neutral-contract.test.ts) constrains identity-brand ownership and runtime-to-UI imports; neither moves. src/ui/codex-realtime/tests/public-api.test.ts pins the exact frozen *export names* of the module index, and adding methods to the existing RealtimeMediaSession interface adds no export name, so that list is unchanged. The addition was therefore permitted as a browser-native one and Mute ships as a real control, not as an unavailable one with a reason.

Sibling edit 1, src/ui/codex-realtime (d11b2649). RealtimeMediaSession gains mute()/unmute(). setMuted toggles every local audio track then publishes through the existing publish(). The transition table admits muted from listening alone and listening from muted alone, so the phase is the whole guard: no run, a cancelled or failed run, or any other phase returns the current published snapshot unchanged rather than raising a failure over a late press. Owner: src/ui/codex-realtime/tests/media-session-mute.test.ts (4 tests) — the track flag and the published phase move together, env.stopCount stays 0 and env.order does not grow (nothing reached the wire), a muted run keeps metering and still releases through the ordinary stop, every other phase is inert, and a device_lost run refuses both. FakeTrack in tests/support/media-session-fakes.ts gained `enabled = true`.

Sibling edit 2, src/ui/codex-workbench-media (9aeec7ea). BrowserWorkbenchMediaOwner gains mute()/unmute(), forwarding to the current run's realtime session through one activeMedia() helper and refusing with the same sentence as stop() when no session is active. No claimLease and no command: a disabled track is not a wire operation. The owner's already-forwarded realtime subscription is what publishes the phase. Owner: tests/media-owner-mute.test.ts (2 tests) — transport.commands and transport.mediaReady do not grow across a mute/unmute, the track flag flips, the forwarded subscription carries 'muted', and a mute with no run refuses by name before and after dispose. The shared fake transport, fake audio element and document stub moved from media-owner.test.ts to tests/support/media-owner-harness.ts so both owner files stay under the 500-line cap (media-owner.test.ts is now 250).

Sibling edit 3, src/ui/voice-session (a436bf9c). VoiceRealtimePort gains mute/unmute; VoiceSessionControls gains canMute (listening) and canUnmute (muted), both gated on !busy exactly like start and stop; VoiceSession gains mute()/unmute() running through the same run() generation and busy discipline. The subscription wiring was not touched. One further projection change, deliberately: runView now attaches a controlFailure this adapter drove, the way it already attached a host coordinator or voice failure. A refused mute is the case that forced it — the phase never moves, so without this the person presses Mute, nothing happens, and the screen still reads as healthy. Owner: tests/voice-mute.test.ts (4 tests) — the offer follows the phase, a toggle the projection did not offer sends nothing (idle, wrong phase, disposed), the binding and sessionId survive a mute with zero lease reads, and a refused mute stays 'listening' with the failure attached and a control offered. Four existing control-literal assertions and the realtime fake were extended for the two new fields.

New module, src/ui/voice-controls (e5fe9a0f, 1f0502bc). contract.ts, lib/projection.ts, lib/VoiceControls.tsx, lib/VoiceLevelMeter.tsx, lib/VoiceGlyph.tsx, lib/reduced-motion.ts, index.tsx, and four test owners plus two support files. Nothing is over 242 lines.

Decisions recorded rather than asked:
- The thirteenth state. VoiceSessionStatus has twelve values; AC #1 lists thirteen. 'failed' splits by the adapter's own outcome: a terminal outcome is terminal_failure, everything else is retryable_failure. A failure is therefore terminal exactly when the adapter says it is, and a retry that is not currently permitted stays on screen carrying the reason instead of disappearing.
- Pending is this module's state, not a second source of voice state. The adapter's controls all go false while it is busy but the view cannot say which command is running, and 'pending/repeated/late input is disabled with an actionable reason' needs that name. The component records the command it sent and clears it when the promise settles, ignoring a settle that arrives after unmount. Every control is refused while one is unsettled and names what is running.
- Every disabled control carries a reason in an sr-only element referenced by aria-describedby, so the refusal is programmatic and not just a tooltip. Where the adapter's own detail sentence is the reason (unavailable, either failure) that sentence is used verbatim; otherwise the module supplies one true sentence per command.
- The command row is persistent. Start, the microphone toggle, and Stop occupy the same three slots in all thirteen states; the toggle is Mute or Unmute depending on the phase. At most one recovery command (Restart, or Close) is appended. Every command in COMMANDS is one method on the adapter, checked exhaustively by satisfies, and the boundaries owner proves there is no other path.
- Reduced motion. The canonical theme stays the only owner of motion values; the module declares no media query and no duration. The one thing a stylesheet cannot express is 'do not open a per-animation-frame subscription', so useReducedMotion reads matchMedia and the meter is not mounted at all when reduce is asked for. Nothing is lost: the meter is supplemental to a named status that is always rendered. The meter is also only permitted in the five live states, which is what makes 'never animates after stop' structural rather than timed.
- The meter is eight segments, not a continuous bar: the level moves in steps, a lit segment is structure rather than a hue, and the whole meter is aria-hidden.
- A module-local typed glyph map (seven marks) rather than the shell icon set, which has no microphone, muted-microphone or speaker mark and belongs to a module this task must not edit.
- The transport row renders in all thirteen states and names the transport with codex-realtime's own REALTIME_MEDIA_FEATURE plus the bound pane, child/epoch/workhorse and coordinator from the view's binding, in DM Mono.
- role="group" became a <fieldset aria-label>, because repository lint prefers the semantic tag over the role.
- text-body had to come off the one className that goes through twMerge: twMerge cannot tell a semantic text size from a semantic text colour and was dropping one of the two. The size now lives on the children.

Verification from the worktree, all green: type-check exit 0 (both projects); lint exit 0; fmt:check 1110 files correct; build:frontend built in 590ms; bun test --isolate over voice-controls + voice-session + codex-realtime + codex-workbench-media + dom-testing = 190 pass / 0 fail / 5056 expect across 18 files; test:repository = 123 pass / 0 fail across 18 files; tests/system/process-contracts/codex-realtime.test.ts = 4 pass / 0 fail; test:modules = 2145 pass / 0 fail across 238 files.

Deliberately out of scope: no shell or frame wiring (TASK-143.04.06 owns it, and the pane guarantee still rests on constructing one voice session per pane); no captured-context panel (.04.03), transcript (.04.04) or spoken-approval presentation (.04.05); no browser owner (.04.07 owns the inventory edit); no package.json, src/ui/shell or test-inventory edit.
<!-- SECTION:NOTES:END -->
