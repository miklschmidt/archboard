---
id: TASK-293
title: >-
  Tell the voice model where the user now stands, in a sentence, and only when
  the user or an outside agent moved it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-20 22:58'
updated_date: '2026-10-11 14:44'
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
- [x] #2 docs/design/codex-workbench-authored-contracts.md and CONTEXT.md state the rule as built, and no path appends a callback envelope to the voice model
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-21: confirmed by the user's retest. With semantic callbacks recorded only, the phantom 'you' lines and the voice model answering itself stopped, so the append-on-every-selection loop was their cause, not the microphone and not the Realtime API.

2026-09-21: tests/system/canvas-state/codex-pane-context.test.ts used to own 'a selection, a board switch and a focus change reach live voice' by reading the JSON callback out of thread/realtime/appendText. With semantic callbacks recorded only it now owns the opposite: those reports are accepted and ordered, and nothing semantic is appended (proven to fail with the old delivery switched back on). When this task lands, give that owner back its person-triggered half: a by-hand pick appends one sentence, a driven step appends nothing.

2026-09-21: planned with the user in a grilling session; the description holds the settled rule, the subtasks 293.01 to 293.06 hold the work in order (01 rename and commit first; 02 cause marks; 03 quiet pane news; 04 operation callbacks, independent; 05 narration speech; 06 outside changes). CONTEXT.md gained User, Pane news and Outside change the same day.

2026-10-11 documentation pass after TASK-293.05 (eeca4d2ca) and TASK-293.06 (1e326b6dd). AC2 named DESIGN.md, which is the visual design document and says nothing about voice; reworded through the CLI to name the authored contracts document and CONTEXT.md, where the rule as built now lives: Coordinator callback bytes (pane news {sentence, stops, by, board}; quiet appendText, speech during a narration, outside changes to both models with the coordinator through thread/inject_items and no turn, own_change and not_shown refusals, nothing coalesced), the Realtime V3 start section (narration), and the glossary entries Pane news and Outside change. The stale copies of the two developer instruction documents in the contracts document were replaced by links to the reviewed files (their digests pin them), with a summary that matches the bytes. No envelope reaches the voice model: src/runtime/codex-coordinator-callbacks/tests/lifecycle.test.ts 'the voice model is only ever given a news sentence, never a callback envelope, quiet or as speech' sends every operation type, an outside write, unmarked focus and selection, a pick and an agent show through a narration and requires every append to be one of the news sentences with no '{'; it fails when the delivery appends the encoded callback instead. Other voice appends are the step/leave speech (presentationSpeech, plain text) and the user's own typed text. The system owners codex-pane-context and codex-outside-change also assert no '{' in what the voice is told.

Real voice session for AC1 (the user): follow docs/design/voice-walkthrough-narration-acceptance.md rows a to l on the dogfood canvas. Beyond the narration rows, check outside a narration: (1) a pick by hand during a narration: the voice finishes its sentence, names what you picked, asks if you have a question, then finishes the step and waits (row i); clicking empty canvas does not stop it (row j); (2) switching the view or the variant by hand mid-step stops it the same way; (3) leaving with Escape: one short acknowledgement, nothing more narrated (row h); (4) an outside agent write: from a terminal, edit a board a pane shows without --as-session, outside a narration (the voice says nothing unasked, but 'what just changed?' is answered from it, and the coordinator knows it without a turn) and mid-narration of that board (row k: the voice says the board changed under the talk and asks how to go on); (5) an agent browser show: from a terminal, browser show another board into the pane, outside and during a narration (row l), never credited to you. Known gap the user should decide on: the reviewed workhorse and coordinator instructions ask for --as-session only on writes, so their own browser show is told as an agent's switch.
<!-- SECTION:NOTES:END -->
