---
id: TASK-293.05
title: A narrator stops for pane news
status: To Do
assignee: []
created_date: '2026-09-21 02:09'
updated_date: '2026-09-21 03:10'
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
- [ ] #1 It is measured and written down, from a real voice session, whether appended speech interrupts audio in progress, and the design follows the answer
- [ ] #2 During a narration a pick, view switch or variant switch by hand reaches the voice model as speech that names the state and asks it to pause and check in; outside a narration the same news stays quiet
- [ ] #3 An emptied selection during a narration is quiet context, and a driven step appends nothing
- [ ] #4 Leaving a narrated walkthrough is spoken as a short acknowledgement and no further step is asked for
- [ ] #5 The voice prompt and coordinator presentation instructions make pane news the one reason to stop, and say the talk resumes by itself from the same step
- [ ] #6 The live voice browser owner shows the speech append for a pick during a narration, and the user confirmed the pause and resume by ear
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-21 source research (Codex clone at /home/msc/Projects/codex, HEAD be2951ea = tag rust-v0.155.1), before any code: archboard starts V3 sessions, and V3 is not the Realtime API wire. It runs the FramelessBidi parser against /v1/live (core/src/realtime_conversation.rs:1469, :1812). thread/realtime/appendSpeech becomes Op::RealtimeConversationSpeech, then RealtimeOutbound::StandaloneSpeech, and in V3 exactly one frame: session.context.append with channel "speakable" (realtime_conversation.rs:2236-2242; wire test app-server/tests/suite/v2/realtime_conversation.rs:3098-3112). Codex sends nothing that interrupts: RealtimeOutboundMessage (codex-api .../protocol.rs:52-84) has no response.cancel, no output_audio_buffer.clear and no truncate; the one conversation.item.truncate (realtime_conversation.rs:2410) is V2-only and fires on the user starting to speak. The app-server has no interrupt method: start, appendAudio, appendText, appendSpeech, stop, listVoices. So whether a speakable append cuts into audio in progress is decided by the /v1/live backend and is NOT in the Codex source. It has to be measured. The cheapest measurement needs no new code: TASK-251 already sends a by-hand step as speech, so during a narration press ArrowRight in the middle of a step and hear whether the narrator stops at once or finishes the step first; the Codex log shows the outbound session.context.append against the output audio deltas. If it queues, nothing archboard can send through Codex 0.155.1 interrupts the model, and AC 1 decides between accepting a pause at the end of the current sentence run and waiting for a Codex that exposes an interrupt.
<!-- SECTION:NOTES:END -->
