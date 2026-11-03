---
id: TASK-566
title: >-
  The narrated README videos play an unbroken voice, and the explainer sells the
  product
status: Done
assignee:
  - '@claude'
created_date: '2026-11-03T04:09:00Z'
updated_date: '2026-11-03T04:56:00Z'
labels:
  - readme
  - voice
  - recording
dependencies: []
priority: high
ordinal: 1015000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner heard the narrated README videos drop out for short moments, like a call with bad reception, and saw the newcomer subtitles arrive seconds late and in chunks.

Measured on 2026-11-03: in a test recording, the recording browser's WebRTC receiver concealed 1.5 s and stretched 1.8 s of an 83 s voice with no packet lost. Its jitter buffer fell to 30-50 ms between sentences and ran dry at each new sentence. A local loopback with the same painting page concealed nothing, so the renderer is not the cause. The late newcomer subtitles came late from upstream: the Codex rollout logged each finished line at the moment the page stamped it. The other kept talks show words about 0.5-0.9 s before they are heard, as before the Rust renderer.

The owner also asked that the explainer walkthrough be rewritten as a marketing video about use cases and the overall system design, not implementation details of the canonical model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recording buffers the voice through the WebRTC receiver's jitterBufferTarget, with the duration and its reason in @archboard/timing
- [x] #2 A kept talk records how much of the voice the receiver concealed and stretched, and model record says when the voice dropped out
- [x] #3 The explainer walkthrough presents Archboard's use cases and overall system design in plain words
- [x] #4 A recorded step reaches the voice as an instruction, so the narration explains each step and asks the listener nothing
- [x] #5 The explainer, pr-walkthrough and newcomer videos are recorded again, each with no concealed voice and subtitles that do not lag the voice, and README.md links the new attachments
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Buffer the recording's voice receiver (RECORDING_MS.voiceBuffer) through a receivers hook in the voice package.
2. Keep the receiver's concealed and stretched samples in the talk; model record says when the voice dropped out.
3. Verify with a test recording: concealed samples near zero.
4. Rewrite the explainer walkthrough through model edit.
5. Record the three narrated videos, check each for concealment and subtitle timing, attach them and update README.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found during re-recording: since PR 19 every recording answered each step as speech from a person and ended on a question. PR 19 changed the recorded lead-in from "Explain in your own words" to "Speak now about this". Restored the instruction, kept the heading out.
Explainer beats now open one module each: root readings fit about thirty modules in the frame and nothing was legible.

Final takes (2026-11-03, a busy machine with other agents running tests): concealed 17,400 / 35,640 / 13,920 samples and stretched 78,384 / 60,719 / 90,264 samples for explainer / pr-walkthrough / newcomer, against 72,622 concealed in 83 s before. The concealment falls in the silence before the first word. No take has a digital-silence gap inside speech. Subtitle first words appear 0.03 to 0.23 s after the voice starts. No take asks the listener a question. Sol review round 1 (gpt-6.1-sol, xhigh): APPROVE, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording now holds 600 ms of the voice in the WebRTC receiver (RECORDING_MS.voiceBuffer) instead of the conversational 30-50 ms that ran dry at each sentence start. TalkCapture stamps each said line when it is heard, so subtitles keep pace with the delayed voice. A talk keeps the receiver's concealed and stretched counts as audio.reception, and model record says when the voice dropped out. A recorded step is an instruction again ('Explain in your own words'), so the voice no longer answers or asks the listener questions. The explainer walkthrough is now 'What Archboard does', a six-beat product tour with one readable module per beat. The three README videos were recorded again and linked. Risks: a little stretching remains (1 to 2 s per take), a few spoken openers ('Okay.', 'Sure.') remain, and subtitles still depend on the Codex transcript side channel.
<!-- SECTION:FINAL_SUMMARY:END -->
