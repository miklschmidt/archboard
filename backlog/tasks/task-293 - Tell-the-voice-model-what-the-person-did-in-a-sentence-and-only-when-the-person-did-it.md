---
id: TASK-293
title: >-
  Tell the voice model what the person did, in a sentence, and only when the
  person did it
status: To Do
assignee: []
created_date: '2026-09-20 22:58'
updated_date: '2026-09-21 00:09'
labels:
  - voice
  - coordinator
dependencies: []
priority: high
ordinal: 507000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While voice is live, semantic callbacks (a board change, a focus change, a selection) used to be appended to the voice model's context as the canonical callback JSON: about 7 KB each, half of it internal identities (childId, epoch, realtimeGeneration, workhorseLink) and half a serialized brief. A narrated walkthrough step changes the pane's selection, so one landed as the model began each step; 33 reached the model in the sessions of 2026-09-20, and the model remarked on them unasked. Worse, it is a feedback loop: the voice model asks for a step, the coordinator presents it, the pane's selection changes, a callback is appended to the voice model, the voice model reacts. Since 2026-09-21 semantic callbacks are recorded only (deliver.ts, reason recorded_only) and nothing semantic reaches the voice model. That is a stopgap. The voice model should hear about what the PERSON did (picked something out, stepped a walkthrough by hand, switched board or variant, moved focus to another pane) as one short plain sentence with names, never ids or JSON, and should hear nothing about changes an agent, the coordinator or a driven presentation caused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person-triggered event reaches the live voice session as one short prose sentence naming what happened with board and subject names, never identifiers, JSON or the brief
- [ ] #2 An event caused by an agent write, a coordinator tool (including present_step) or any other non-person source reaches the voice model as nothing, so presenting a step cannot cause an append
- [ ] #3 The source of a pane event (person or not) is decided from evidence the pane or server already has, not guessed from timing
- [ ] #4 Operation callbacks that still go to the voice model (accepted, queued, started, progress, attention) are reviewed under the same rule: prose or nothing, never the correlation envelope
- [ ] #5 DESIGN.md and the authored contracts document state the rule, and a focused owner proves a driven step appends nothing while a by-hand pick appends one sentence
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-21: confirmed by the user's retest. With semantic callbacks recorded only, the phantom 'you' lines and the voice model answering itself stopped, so the append-on-every-selection loop was their cause, not the microphone and not the Realtime API.

2026-09-21: tests/system/canvas-state/codex-pane-context.test.ts used to own 'a selection, a board switch and a focus change reach live voice' by reading the JSON callback out of thread/realtime/appendText. With semantic callbacks recorded only it now owns the opposite: those reports are accepted and ordered, and nothing semantic is appended (proven to fail with the old delivery switched back on). When this task lands, give that owner back its person-triggered half: a by-hand pick appends one sentence, a driven step appends nothing.
<!-- SECTION:NOTES:END -->
