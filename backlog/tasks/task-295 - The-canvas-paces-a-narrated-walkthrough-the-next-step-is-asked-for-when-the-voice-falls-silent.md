---
id: TASK-295
title: The voice model asks for the next step itself when it finishes one
status: To Do
assignee: []
created_date: '2026-09-22 00:45'
updated_date: '2026-09-22 17:08'
labels:
  - voice
dependencies: []
ordinal: 515000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on 2026-09-22 02:38 (and the same shape on 2026-09-20 15:34): the coordinator answers a step in 4-6 s, but the voice model does not hand off for the next step when it finishes explaining one, although its prompt tells it to hand off in that same turn. Today's session: step 1 explained 00:38:08-00:38:32, handoff only at 00:38:50 (twice, 2 s apart, so present_step ran twice in one coordinator turn), step 2 explained until 00:39:16, then nothing for 56 s until the user stopped. The narration clock recorded 24.4 s end-to-next-start for step 2. Nothing the canvas appended is involved. Ruled out by the user on 2026-09-22: the canvas pacing the talk itself by starting coordinator turns when the voice falls silent. The fix has to be in what the voice model is told and how it hands off: why it does not hand off in the same response as its speech, and whether a handoff can follow speech at all on the V3 wire, is the open question, to be answered from the Codex source and a real session's frames (the adapter currently drops thread/realtime/itemAdded payloads as 'outside the item-scoped contract', so those frames may need keeping first).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the voice finishes speaking a presented step that is not the last and stays silent for one grace period named in timing.ts, the canvas asks the coordinator for the next step without the voice model handing off; the step reaches the voice model and is spoken.
- [ ] #2 A handoff the voice model makes itself, or user speech, inside the grace period cancels the canvas's request, and a step is never asked for twice for one silence.
- [ ] #3 The voice prompt for presentation mode no longer asks the model to hand off for the next step, only for questions; the coordinator's instructions say the same.
- [ ] #4 Measured in a real voice session with the narration clock: end-to-next-start under 10 s for consecutive steps, with the timing recorded on this task.
- [ ] #5 It is known, from the Codex source or recorded session frames, whether a V3 voice response can carry both speech and a handoff, and what made the 02:38:50 handoffs happen.
- [ ] #6 After a step that is not the last, the voice model hands off for the next step without user speech and without the canvas starting a turn; measured with the narration clock in a real session, end-to-next-start under 10 s for consecutive steps.
- [ ] #7 A step is never asked for twice for one silence.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-22: server-paced narration rejected by the user ('never gonna work'); task reframed around the voice model's own handoff.
<!-- SECTION:NOTES:END -->
