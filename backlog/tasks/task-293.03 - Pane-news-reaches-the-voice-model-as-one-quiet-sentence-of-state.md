---
id: TASK-293.03
title: Pane news reaches the voice model as one quiet sentence of state
status: Done
assignee:
  - '@claude'
created_date: '2026-09-21 02:08'
updated_date: '2026-09-21 03:01'
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
- [x] #1 A report with marked parts appends exactly one developer-role sentence to the live voice session, naming the board and only the marked parts as state, with labels and never identifiers
- [x] #2 More than three selected subjects are told as three labels and a count, and an emptied selection is told as nothing selected
- [x] #3 A report or registration with no marked part appends nothing and is recorded as not delivered with the reason agent
- [x] #4 Nothing is injected into the coordinator thread for pane news, and nothing is sent when voice is inactive
- [x] #5 tests/system/canvas-state/codex-pane-context.test.ts regains its user-triggered half: a pick by hand appends one sentence, a driven step appends nothing
- [x] #6 DESIGN.md and the authored contracts document describe pane news, and the voice prompt says the sentence is a hint that never replaces a fresh lookup
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Carry what the user changed from the pane routes to the semantic pane events: the reading report byUser and a registration whose focused flag flipped, through publishPaneContext, as userChanged on the focus and selection events. On the event, not in the brief, which is what a workhorse is given as context.
2. codex-coordinator-callbacks: pane-news.ts writes the sentence from names the event already holds (board, variant, view, selected subjects); the semantic callback carries it as news (null when nothing was the user own doing); deliver sends news through the existing voice path with its generation authority, and records everything else (reason agent with voice live, voice_inactive without).
3. Voice prompt: the quiet line is a hint, never the answer. DESIGN.md and the authored contracts document describe pane news.
4. Owners: callbacks module tests for the sentence and the delivery; the pane-context system test regains its user half.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The pane events are published only for the pane linked to the voice coordinator, so focus news is about that pane: the user is now in it, or now in another pane. The marks first rode on the brief pane block, which changed the context a workhorse is given (caught by the production composition system test); they are on the event now and the brief is byte-identical to before. The fake Codex log holds the answer to each appendText under the same method, and the board catalogue is appended by its own channel when a board is created: the system owner filters both. tests/system/canvas-state/doing-activity.test.ts failed once in a full system lane run and passed alone three times and on the rerun, as it did on 2026-09-21 before this work; it is an intermittent failure under load that nobody has diagnosed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pane report whose marks say the user changed something reaches the live voice session as one developer-role sentence of state: the board always, the variant, view and selection only when they are what changed, up to three subjects by name then a count, an emptied selection said, a subject without a name said by its kind, never an id or JSON. Focus news says which pane the user is now in. Everything unmarked, every settled change, and everything while voice is inactive is recorded and told to nobody (reasons agent and voice_inactive); nothing is injected into the coordinator thread. The sentence travels the callbacks module voice path, so the generation authority and the ledger still apply, and the callback record gained a news field (golden bytes differ by that field alone). Voice prompt, DESIGN.md and the authored contracts document say what pane news is. Verified: six callbacks-module tests; the pane-context system test, which appends exactly two sentences for a marked pick and a focus move and none for an agent board switch and two unmarked readings, and fails when every report is credited to the user; lint, fmt, both type-checks, modules 3451 pass, system 169 pass, repository 8 pass, serial browser lane 19 pass.
<!-- SECTION:FINAL_SUMMARY:END -->
