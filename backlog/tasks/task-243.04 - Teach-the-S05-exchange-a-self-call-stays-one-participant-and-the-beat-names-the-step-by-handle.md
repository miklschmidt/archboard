---
id: TASK-243.04
title: >-
  Teach the S05 exchange: a self call stays one participant, and the beat names
  the step by handle
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:31'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 418000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 is 0/3 in both arms and the candidate fails the same three features every time. Authors refine `Request context` into `RequestContext.push` and `RequestContext.match_request` participants, so URL matching becomes a call between two nodes and the self message the source has (push calls self.match_request in ctx.py) cannot exist; the S00 feature rewarding calls on the exact function pulls in that direction. Beats name only nodes and never the push step. `as` handles are declared on edges and never referenced. The references cover all three (sequences-views-walkthroughs beats, authoring handles) but the create-sequence recipe steps and its worked example never show a handle on a step named by a beat, and authors read the recipe and stop. TASK-235.11 already moved the expectation to the one self step the source has.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The sequence recipe says a call a participant makes on itself is one `self` step on that participant, and that a class is not split into method participants to draw it
- [x] #2 The recipe worked example gives the step a walkthrough explains an `as` handle and a walkthrough beat that names that step by the handle with the view set, and the numbered steps say to do so
- [x] #3 bun run eval:skill check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. create-sequence.md step 1: a call a participant makes on itself is one self step on that participant; do not split a class into method participants to draw it. Beat subjects name the step by its as handle with view set. 2. Worked example: as on the self step, a walkthrough whose beat names it by handle with the view. 3. Step 3 check: the beat resolves to the step. 4. eval:skill check, fmt, sync.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
create-sequence.md step 1 states the self rule (a class drawn as one part keeps its own call as a self step; never split it into method participants) and the beat rule (handle on the step, handle in subjects, view set); the worked example carries as: load on the self step and a walkthrough beat naming load, ScriptInfo, run_simple through Startup exchange; step 3 checks the saved beat carries the step's minted id. Verified the example payload through the board store: the beat's saved subjects are the step id, two node ids, and the view resolved to its id. eval:skill check ok, fmt clean, skills synced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Taught the S05 lessons in the sequence recipe and proved its example resolves the handle to the step; verified through the store and eval:skill check.
<!-- SECTION:FINAL_SUMMARY:END -->
