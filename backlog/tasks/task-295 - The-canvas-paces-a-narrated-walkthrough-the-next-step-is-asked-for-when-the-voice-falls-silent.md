---
id: TASK-295
title: >-
  The canvas paces a narrated walkthrough: the next step is asked for when the
  voice falls silent
status: To Do
assignee: []
created_date: '2026-09-22 00:45'
labels:
  - voice
dependencies: []
ordinal: 515000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on 2026-09-22 02:38 (and the same shape on 2026-09-20 15:34): the coordinator answers a step in 4-6 s, but the voice model does not hand off for the next step when it finishes explaining one, although its prompt tells it to hand off in that same turn. In V3 a response is either speech or a handoff; after speech the session waits for input. Today's session: step 1 explained 00:38:08-00:38:32, handoff only at 00:38:50 (twice, 2 s apart, so present_step ran twice in one coordinator turn), step 2 explained until 00:39:16, then nothing for 56 s until the user stopped. The narration clock recorded 24.4 s end-to-next-start for step 2. Nothing the canvas appended is involved: no text or speech was appended to the voice session after the start. Codex 0.155.1 (core/src/realtime_conversation.rs v3_output_writer) appends a coordinator [FINAL] with no active handoff as a standalone speakable context item, the same channel a handed-off step arrives on, so a coordinator turn the canvas starts itself reaches the voice model exactly as a step does today. The canvas already hears assistant_finished (narration-timing) and already starts coordinator turns for callbacks (codex-coordinator-callbacks deliverThroughCoordinatorTurn).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the voice finishes speaking a presented step that is not the last and stays silent for one grace period named in timing.ts, the canvas asks the coordinator for the next step without the voice model handing off; the step reaches the voice model and is spoken.
- [ ] #2 A handoff the voice model makes itself, or user speech, inside the grace period cancels the canvas's request, and a step is never asked for twice for one silence.
- [ ] #3 The voice prompt for presentation mode no longer asks the model to hand off for the next step, only for questions; the coordinator's instructions say the same.
- [ ] #4 Measured in a real voice session with the narration clock: end-to-next-start under 10 s for consecutive steps, with the timing recorded on this task.
<!-- AC:END -->
