---
id: TASK-293.03
title: Pane news reaches the voice model as one quiet sentence of state
status: To Do
assignee: []
created_date: '2026-09-21 02:08'
labels:
  - voice
  - coordinator
dependencies:
  - TASK-293.01
  - TASK-293.02
parent_task_id: TASK-293
priority: high
ordinal: 510000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With semantic callbacks recorded only, the voice model no longer knows what the user means by "this" after they pick something out or switch board, and asks. It should hear pane news as one quiet sentence describing where the pane now stands, not what was clicked: "The user is now looking at view Data flow on board payments (data)", "…with Lease store, Board store and 4 more selected", "…with nothing selected", "The user is now in the pane showing payments". Only the parts the user changed, always the board, names from the board store and never from the browser, no ids, no JSON, no pane letter. It is a hint: the fresh-lookup rule in the voice prompt stays and the prompt says so in one line. Voice model only; the coordinator reads the pane through its tools. It travels through the callbacks module so the delivery record, the ledger and the voice-generation authority still apply (a sentence must not land in a session that was replaced); the 7 KB envelope is no longer built for semantic kinds. The pane debounce is the only coalescer: a hold would delay the hint past the moment the user asks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A report with marked parts appends exactly one developer-role sentence to the live voice session, naming the board and only the marked parts as state, with labels and never identifiers
- [ ] #2 More than three selected subjects are told as three labels and a count, and an emptied selection is told as nothing selected
- [ ] #3 A report or registration with no marked part appends nothing and is recorded as not delivered with the reason agent
- [ ] #4 Nothing is injected into the coordinator thread for pane news, and nothing is sent when voice is inactive
- [ ] #5 tests/system/canvas-state/codex-pane-context.test.ts regains its user-triggered half: a pick by hand appends one sentence, a driven step appends nothing
- [ ] #6 DESIGN.md and the authored contracts document describe pane news, and the voice prompt says the sentence is a hint that never replaces a fresh lookup
<!-- AC:END -->
