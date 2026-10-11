---
id: TASK-293.05
title: A narrator stops for pane news
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-21 02:09'
updated_date: '2026-10-11 14:28'
labels:
  - voice
  - coordinator
dependencies:
  - TASK-293.03
parent_task_id: TASK-293
priority: high
ordinal: 512000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During a narrated walkthrough (TASK-251) a user who picks a node is signalling that the talk did not cover it well enough. The maintainer wants the narrator to pause and ask whether they have a question about it, which is the opposite of the current prompt ("Do not stop for questions"). So during an active narration pane news is speech, not quiet context: a non-empty pick or a view or variant switch by hand makes the model pause, ask about what is now selected or on screen, and once the user has answered or declined go on by itself from the step it was on, finishing it if it was cut off; the latest of several picks wins. An emptied selection stays quiet, because clicking empty canvas should not stop a talk. Leaving the walkthrough, quiet context today, becomes a short spoken acknowledgement and the narration stops. The highlight a driven step makes is unmarked and stays silent. UNKNOWN that decides the design: whether text sent through realtimeAppendSpeech cuts off audio already being spoken or queues behind it; nothing in this repository says. Measure that in a real voice session first; if it queues, find an explicit interrupt before building on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 It is measured and written down, from a real voice session, whether appended speech interrupts audio in progress, and the design follows the answer
- [x] #2 During a narration a pick, view switch or variant switch by hand reaches the voice model as speech that names the state and asks it to pause and check in; outside a narration the same news stays quiet
- [x] #3 An emptied selection during a narration is quiet context, and a driven step appends nothing
- [x] #4 Leaving a narrated walkthrough is spoken as a short acknowledgement and no further step is asked for
- [x] #5 The live voice browser owner shows the speech append for a pick during a narration
- [ ] #6 The user confirmed the pause and resume by ear in a real voice session (acceptance rows i and j of docs/design/voice-walkthrough-narration-acceptance.md)
- [x] #7 The voice prompt makes pane news the one reason to stop mid-step; after answering, the voice finishes the step it was on if it was cut off and then waits for the user to move on, as every narration does since TASK-251 moved to manual stepping
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC1: record the answer already measured in the real-voice runs of TASK-251 (row e, 2026-09-23/24): appended speech does not cut into audio in progress; the voice finishes what it is saying first. Design follows: the pause lands after the current speech; nothing tries to interrupt.
2. Callbacks: the realtime port appends either quiet context (appendText, developer) or speech (appendSpeech); a new canvas read says whether a live narration is under way in this tab. During it, pane news for a non-empty pick, a view or a variant switch by hand goes as speech; an emptied selection and a focus move stay quiet; a driven step stays unmarked and is appended nowhere. The latest of several queued picks wins (existing coalescing).
3. Narration prompt: pane news is the one reason to stop mid-step; after the answer, finish the step if cut off and wait. Voice prompt: pane news is never a reason to speak unasked outside a narration.
4. Owners: callbacks module owner (speech vs quiet vs nothing), presentation-mode owner for leaving, the live-voice browser owner gains a pick during the narration that reaches the voice as speech.
5. Split AC5 into the browser-owner half and the by-ear half (human).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-21 source research (Codex clone at /home/msc/Projects/codex, HEAD be2951ea = tag rust-v0.155.1), before any code: archboard starts V3 sessions, and V3 is not the Realtime API wire. It runs the FramelessBidi parser against /v1/live (core/src/realtime_conversation.rs:1469, :1812). thread/realtime/appendSpeech becomes Op::RealtimeConversationSpeech, then RealtimeOutbound::StandaloneSpeech, and in V3 exactly one frame: session.context.append with channel "speakable" (realtime_conversation.rs:2236-2242; wire test app-server/tests/suite/v2/realtime_conversation.rs:3098-3112). Codex sends nothing that interrupts: RealtimeOutboundMessage (codex-api .../protocol.rs:52-84) has no response.cancel, no output_audio_buffer.clear and no truncate; the one conversation.item.truncate (realtime_conversation.rs:2410) is V2-only and fires on the user starting to speak. The app-server has no interrupt method: start, appendAudio, appendText, appendSpeech, stop, listVoices. So whether a speakable append cuts into audio in progress is decided by the /v1/live backend and is NOT in the Codex source. It has to be measured. The cheapest measurement needs no new code: TASK-251 already sends a by-hand step as speech, so during a narration press ArrowRight in the middle of a step and hear whether the narrator stops at once or finishes the step first; the Codex log shows the outbound session.context.append against the output audio deltas. If it queues, nothing archboard can send through Codex 0.155.1 interrupts the model, and AC 1 decides between accepting a pause at the end of the current sentence run and waiting for a Codex that exposes an interrupt.

2026-09-23: TASK-251 moved to manual stepping (user decision) and present_step is being deleted, so a narration no longer resumes or advances by itself and there are no coordinator presentation instructions. Where the description says the narrator goes on by itself from the step it was on, read: it answers, finishes that step if it was cut off, then waits for the user to step.

2026-10-11 AC1 answered from the real-voice runs already recorded on TASK-251 (row e, 2026-09-23 and the rerun of 2026-09-24): steps appended through thread/realtime/appendSpeech mid-explanation did NOT cut into audio in progress; the voice finished what it was saying, then spoke to the newer step. Codex sends StandaloneSpeech as a speakable session.context.append with no response request, and V3 has no cancel event (Codex source read at rust-v0.155.1, commit 5a68b098b). The design follows: nothing tries to interrupt; the pause lands after the sentence being said, and the narration prompt says so (finish the sentence you are on, then check in). The user accepted that.

Built: pane news carries {sentence, stops}; stops is true for a non-empty pick, a view or a variant the user chose on the board they were on (pane-news.ts). The callbacks' realtime port appends either quiet context (appendText, developer) or speech (appendSpeech); a new canvas read (CoordinatorCallbackOptions.canvas, server narratedBoardOf per tab, never during a recording) says whether a narration is under way, read at delivery so news queued behind leaving is quiet. Delivery path realtime_appendSpeech. An emptied selection, a focus move and a board of the user's choosing stay quiet; a driven step is unmarked and appended nowhere; pending picks coalesce so the latest is said. The speech text is the state sentence only; the narration prompt (presentation-mode.ts) is what asks the voice to pause, check in, finish the step if cut off, and wait. The voice prompt says a quiet line is never a reason to speak and that only a narration hands one over as speech.

Evidence: src/runtime/codex-coordinator-callbacks/tests/pane-news.test.ts (speech during a narration for pick/view/variant and quiet outside it; emptied selection and focus quiet, driven step silent; latest of queued picks) fails with the channel forced to quiet. tests/system/browser/codex-live-voice.test.ts now picks Ingest mid-narration and requires a third appendSpeech naming it and not its id, the pane still on step 2, then leaving as the fourth; it failed with the channel forced to quiet and passed 3 of 3 runs through run-browser-lane. Leaving: presentation-mode.test.ts 'each step and leaving reach the voice model as speech' and the browser owner (leaving is one appendSpeech line, 'The user left the walkthrough, so the narration is over.'). AC5 split: the browser half is #5, the by-ear half is #6 (rows i and j added to the acceptance script).
<!-- SECTION:NOTES:END -->
