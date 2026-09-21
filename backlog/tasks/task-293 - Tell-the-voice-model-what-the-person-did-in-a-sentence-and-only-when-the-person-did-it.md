---
id: TASK-293
title: >-
  Tell the voice model where the user now stands, in a sentence, and only when
  the user or an outside agent moved it
status: To Do
assignee: []
created_date: '2026-09-20 22:58'
updated_date: '2026-09-21 02:09'
labels:
  - voice
  - coordinator
dependencies: []
priority: high
ordinal: 507000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While voice is live, semantic callbacks (a board change, a focus change, a selection) used to be appended to the voice model as the canonical callback JSON: about 7 KB each, half internal identities and half a serialized brief. A narrated walkthrough step changes the pane selection, so one landed as the model began each step; 33 reached the model in the sessions of 2026-09-20 and it remarked on them unasked. It was a feedback loop: the voice model asks for a step, the coordinator presents it, the selection changes, a callback is appended, the voice model reacts. Since 2026-09-21 semantic callbacks are recorded only, which the user confirmed stops the phantom lines; that is a stopgap.

The rule settled with the user on 2026-09-21 (glossary: User, Pane news, Outside change in CONTEXT.md):
- The voice model hears pane news: where the reading of a pane stands after the user changed it by hand (board or drill-down, variant, view, selection, the pane they moved to). One sentence of names that describes the resulting state and only the parts that changed, always naming the board, never the action taken, never ids or JSON, never a pane letter. Up to three subjects by label, then a count; an emptied selection is told too.
- Whether it is said is decided by the pane: each report and registration marks which parts the hand of the user changed, and an unmarked part is told to nobody (deny by default) and recorded with the reason agent. One pane report is a debounced snapshot and can mix causes, which is why the mark is per part.
- Outside narration pane news is quiet context for the voice model only; it is a hint for what "this" means and the fresh-lookup rule in the voice prompt stays. The coordinator is not told: it reads the live pane through its tools.
- During an active narration pane news is speech: the model pauses, asks whether the user has a question about what they picked or switched to, and resumes by itself from the step it was on. The exception is an emptied selection, which stays quiet. Leaving becomes a spoken short acknowledgement.
- What the workhorse, the coordinator or a driven step caused reaches nobody. An outside change (a board write whose stated session is neither the linked workhorse nor the coordinator, unattributed writes included, on a board some pane shows) and an agent switching a pane are told to both the voice model and the coordinator thread, quietly, and as speech during a narration.
- No JSON envelope reaches the voice model from any path, operation callbacks included.
Subtasks carry the work; this parent holds the rule and is finished when they are.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is done and the rule in the description holds end to end in a real voice session the user ran
- [ ] #2 DESIGN.md and the authored contracts document state the rule as built, and no path appends a callback envelope to the voice model
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-21: confirmed by the user's retest. With semantic callbacks recorded only, the phantom 'you' lines and the voice model answering itself stopped, so the append-on-every-selection loop was their cause, not the microphone and not the Realtime API.

2026-09-21: tests/system/canvas-state/codex-pane-context.test.ts used to own 'a selection, a board switch and a focus change reach live voice' by reading the JSON callback out of thread/realtime/appendText. With semantic callbacks recorded only it now owns the opposite: those reports are accepted and ordered, and nothing semantic is appended (proven to fail with the old delivery switched back on). When this task lands, give that owner back its person-triggered half: a by-hand pick appends one sentence, a driven step appends nothing.

2026-09-21: planned with the user in a grilling session; the description holds the settled rule, the subtasks 293.01 to 293.06 hold the work in order (01 rename and commit first; 02 cause marks; 03 quiet pane news; 04 operation callbacks, independent; 05 narration speech; 06 outside changes). CONTEXT.md gained User, Pane news and Outside change the same day.
<!-- SECTION:NOTES:END -->
