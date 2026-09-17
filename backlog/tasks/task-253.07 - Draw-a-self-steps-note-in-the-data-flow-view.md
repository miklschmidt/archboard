---
id: TASK-253.07
title: Draw a self step's note in the data-flow view
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 447000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-17 batch the grader reported in 5 of 6 S07 runs that the load step note (a self step with repeat 2) is not drawn in the Startup exchange capture, so a reader of the picture misses the branch explanation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A self step with a note draws the note in the data-flow render, readable and not overlapping the step label or the next message
- [x] #2 A renderer test owns it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. sequence-design.ts note constants. 2. layout/step-rows.ts placeNote (plus labelFor and pitchOf moved there to keep dataflow.ts under the line limit); placeSteps grows each row by its note; lowestDrawn and stepBox cover it. 3. svg/dataflow.ts paintNote in the step group after the label. 4. step-notes.test.ts. 5. Look at a real board through headless Chromium.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No step note was drawn in any data-flow picture, not only on self steps, although sequences-views-walkthroughs.md says a note is shown beside its step. placeNote (layout/dataflow.ts) measures the note with measureNoteLines in the card note face. It wraps to the hop, 180 to 320 units wide, kept inside the flow columns, and sits under the message: under the loop for a self step, starting past the lifeline. The row pitch grows by the note height. stepBox covers the note, so the atlas and page bounds include it. paintNote draws the lines on a plate of the band fill, in the step group after its label. Checked visually: the S07 candidate r1 board rendered through headless Chromium shows the whole note under the load loop, and the return moves down. Test in dataflow.test.ts.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Step notes are now drawn whole under their message in data-flow pictures (self steps included), and later messages move down to make room. Verified by step-notes.test.ts, a headless-Chromium look at the S07 board, and bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:FINAL_SUMMARY:END -->
