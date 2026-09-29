---
id: TASK-301
title: Every voice start gets a fresh coordinator thread and voice session
status: To Do
assignee: []
created_date: '2026-09-22 21:26'
updated_date: '2026-09-29 02:37'
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
- [ ] #1 Starting voice creates a new coordinator thread, and the previous session's coordinator thread is never resumed by a later voice start
- [ ] #2 A coordinator turn or workhorse operation still running when voice stops is not lost: it is finished, cancelled or reported by an owner that is named in the task notes
- [ ] #3 The pane's thread link and anything the browser shows about the coordinator follow the new thread
- [ ] #4 Covered by a coordinator lifecycle owner, and verified with two consecutive voice starts in one canvas run producing two coordinator rollouts
- [ ] #5 Two recordings in a row on one Archboard server each narrate every step of their own walkthrough from step 1, and speak nothing from the earlier session
- [ ] #6 A coordinator answer that arrives after voice stops is never spoken in a later voice session, and a test reproduces the TASK-370 case
- [ ] #7 Nothing a stopped voice session held on the server (transcript, narration position, workhorse waits) reaches the next voice session
<!-- AC:END -->
