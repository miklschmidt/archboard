---
id: TASK-301
title: Every voice start gets a fresh coordinator thread and voice session
status: Done
assignee:
  - '@claude'
created_date: '2026-09-22 21:26'
updated_date: '2026-09-29 03:26'
labels:
  - voice
  - codex
dependencies: []
priority: high
type: bug
ordinal: 521000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user ruled on 2026-09-22 that each voice start gets a new coordinator thread. On 2026-09-29 the user ruled that starting or stopping voice gives a new coordinator thread and a new voice session, so that nothing from one talk reaches the next.

Read from the recorded sessions on 2026-09-22: the coordinator thread is created once per canvas run (child epoch) and reused by every voice session started in that run. Four runs between 2026-09-07 and 2026-09-21 put two voice sessions on one coordinator thread. A reused thread carries the previous talk's hand-overs, by-hand step notices and presentation-mode instructions into the next session. There they read as live history, for example which step a narration stands on, or that the user asked for Danish.

Seen again on 2026-09-29 (formerly TASK-370, folded in here). The README videos were re-recorded with Codex 0.158.0 and the voice prompt at 632f20e0. The newcomer walkthrough was recorded right after the pull-request walkthrough on the same server (port 3397). At step 1 it said "I couldn't tell what you wanted me to do, so I have no board changes or pending voice work. And that's the tour." It never explained step 1, and it narrated steps 2 to 6 correctly. The same walkthrough, recorded first on a new server (port 3421), narrated step 1 correctly.

Likely mechanism, read from the code and not yet reproduced. Archboard starts realtime with flushTranscriptTailOnSessionEnd set to true. When a session ends, Codex asks the coordinator to acknowledge the transcript tail, and that starts one more coordinator turn after the stop. Codex routes a later coordinator message on that thread to the realtime session that runs on it then (handoff_out in core/src/realtime_conversation.rs). The second recording ran on the same coordinator thread, so the first session's closing answer was spoken at its step 1.

Each voice start already opens a new Codex realtime session. Server state of a stopped session stays until the next start: the realtime adapter's retained transcript, the walkthrough-narration maps (voicePanes, narrated) and the workhorse-news waits (waitingOn).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Starting voice creates a new coordinator thread, and the previous session's coordinator thread is never resumed by a later voice start
- [x] #2 A coordinator turn or workhorse operation still running when voice stops is not lost: it is finished, cancelled or reported by an owner that is named in the task notes
- [x] #3 The pane's thread link and anything the browser shows about the coordinator follow the new thread
- [x] #4 Covered by a coordinator lifecycle owner, and verified with two consecutive voice starts in one canvas run producing two coordinator rollouts
- [x] #5 Two recordings in a row on one Archboard server each narrate every step of their own walkthrough from step 1, and speak nothing from the earlier session
- [x] #6 A coordinator answer that arrives after voice stops is never spoken in a later voice session, and a test reproduces the TASK-370 case
- [x] #7 Nothing a stopped voice session held reaches the next one: its transcript and narration start empty, and a workhorse wait that still lasts is news to the new coordinator
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: Voice coordinator@TASK-301 (the Coordinator thread part says a voice start replaces a coordinator that already carried a voice session) and Codex workhorse@TASK-301 (Workhorse operations follow their workhorse turn after the coordinator is replaced). No part or relationship moves.

Decisions, from the binding map of 2026-09-29:
- A coordinator thread carries at most one voice session. A voice start replaces the coordinator only when the current one already carried a voice session, so the first start after sign-in keeps its latency.
- The replacement keeps the old coordinator published and retained until the new thread is started, confirmed and committed, then swaps both in one step. The pane never leaves thread_capable, and the queue and approvals keep working.
- A failed replacement keeps the old coordinator for the visual workbench and refuses the voice start with the coordinator's reason; the next start tries again. An uncertain record left by a failed replacement no longer stops ensure from reusing the retained, proven coordinator.
- A coordinator turn still running at stop, including the transcript-tail turn, finishes on its own thread. Its tool calls are refused once the new coordinator is current, and it has no realtime session to speak into.
- Workhorse operations keep following their workhorse turn after a replacement, so they reach a terminal event. Their callbacks settle as not delivered (stale_coordinator), and the new coordinator hears what the workhorse did through workhorse news. AC #2 owners: codex-workhorse-operations and codex-coordinator-callbacks.
- A workhorse wait is news once per coordinator, so a wait that lasts into a new talk is news to its coordinator.

Steps:
1. src/runtime/codex-coordinator: a replace entry point, serialized with ensure, that stages its snapshots and persistence and publishes them only when the new coordinator is ready; failures throw CodexCoordinatorError and leave the old coordinator. reuse.ts consults uncertain records only when nothing is retained. Tests in lifecycle.test.ts and reuse.test.ts.
2. src/server/archboard/lib/codex-workbench-realtime-actions.ts: remember the coordinator thread the last session ran on; after makeRoom, replace the coordinator when it is that thread, with an operation id from the identity issuer, before tracedPending. Test in codex-workbench-realtime-actions.test.ts: two starts give two coordinator threads, the second realtime start names the new one, a failed replacement refuses the start and keeps the old coordinator.
3. src/runtime/codex-workhorse-operations: notifications.ts, events.ts (queued-submission correlation and unknown-queue reconciliation) compare child, epoch and workhorse target; call validation keeps the coordinator fence. Test: an operation accepted before a replacement reaches its terminal event.
4. src/runtime/codex-coordinator-callbacks/lib/workhorse-news.ts: waitingOn is keyed by coordinator and workhorse thread. Test in its news tests.
5. src/ui/voice-session/lib/binding.ts: a moved coordinator no longer replaces the session; the server fences the coordinator. Test in the voice-session binding tests.
6. Docs: ADR 0019 amendment (one coordinator per voice session), CONTEXT.md Voice coordinator entry, coordinator.ts, contract.ts and tell-coordinator.ts comments.
7. Verify: module, system and browser lanes, the gate; two walkthrough recordings in a row on one scratch Archboard server with real Codex (AC #5), counting the coordinator rollouts (AC #4).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned.
- Coordinator: replace() stages the start's snapshots and persistence (publish() routes to the stage while a replacement runs) and swaps both only once the fresh coordinator is ready; any other end throws transaction_failed and leaves the current one. reuse.ts consults uncertain coordinator_start records only when nothing is retained.
- Voice start: codex-workbench-realtime-actions.ts remembers the coordinator thread the last session started on and replaces it before tracedPending; a failed replacement refuses the start ("Voice could not start a fresh coordinator: ...") and the next start tries again.
- AC #2 owners: codex-workhorse-operations follows an accepted operation's workhorse turn to its terminal event after a replacement (sameWorkhorse at the notification, queued-submission and unknown-queue correlation sites; the call fence in validation.ts keeps the coordinator). Its callbacks settle not_delivered/stale_coordinator in codex-coordinator-callbacks, and the new coordinator hears the turn's end as workhorse news. A coordinator turn left running on the old thread finishes there; its tool calls are refused by call-provenance once the new coordinator is current.
- Workhorse news keys a wait by coordinator and wire thread.
- Browser: VoiceSessionBinding no longer carries the coordinator; a coordinator change is not a replacement of the session.
- The production fake Codex treats the newest coordinator-model thread as the coordinator (it had pinned thread-1), and the live voice browser test proves narration after a talk runs on a fresh coordinator and each End stops its own session's coordinator.
- Not done, outside the criteria: coordinator threads are still listed as thread-link candidates (one more per replaced coordinator), and retired coordinator threads stay loaded in the Codex child until it restarts; the reviewed protocol has no unload request.

Validation 2026-09-29:
- Gate lanes: lint, fmt:check, type-check, 3717 module tests, 182 system tests (walkthrough-recording failed once under load on Chromium's page size and passed twice alone), repository, and 18 serial browser tests, including codex-live-voice, which now proves narration after a talk runs on a fresh coordinator and each End stops its own session's coordinator.
- Real Codex, one scratch Archboard server (port 3441, fresh canvas state): two recordings in a row, "Why voice is its own thread" then "Read this board". The epoch ledger holds two committed coordinator_start records, with rollouts 01a0eb2d-a303-7120-b7c0-d508d6b7387e and 01a0eb30-1e67-7091-b50f-65479711b4ea. The first narrated its 6 steps on the sign-in coordinator; after it ended, Codex ran a transcript_tail_flush turn on that thread, which answered at 03:23:14 UTC. The second started at 03:23:15 on the fresh coordinator, and its first words are step 1 of its own walkthrough; it narrated all 5 steps. The late answer stayed on the old thread. This is the TASK-370 mechanism, observed, and now isolated.
- The first voice start after sign-in runs on the sign-in coordinator, which has carried no session; every later start runs on a new one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A coordinator carries at most one voice session. A voice start that finds the coordinator already carried one replaces it first; the replacement stages its start and swaps the coordinator only once the fresh thread is ready, and a replacement that does not come up refuses the start and keeps the old coordinator. Workhorse operations follow their turn to the end after a replacement, a workhorse wait is news once per coordinator, and the browser's voice session is no longer bound to the coordinator. ADR 0019, CONTEXT.md and the Voice coordinator and Codex workhorse boards say so. Verified with new tests in the coordinator, operations, callbacks, server realtime actions and voice-session modules, the live voice browser test, the full gate lanes, and two real recordings in a row on one server: two coordinator rollouts, and the second recording narrated from its own step 1 while the first session's late answer stayed on the old thread.
<!-- SECTION:FINAL_SUMMARY:END -->
