---
id: TASK-590.02
title: The history reads as a timeline of states with their reasons
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T13:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1045000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site history timeline: the current state on a gold-ringed card, then each adopted, shelved or proposed state as a node on a rail with its date and reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The History tab of the left column and the timeline of About show the current state as a card and the other states as nodes on a rail
- [x] #2 An adopted node is gold, a proposal node has the changed ring, and a shelved node is faint
- [x] #3 Each state keeps its date and its recorded reason
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give each record row its kind, the date that put the state where it stands, and its reason (record-rows.ts).
2. Draw a node for each lifecycle (TimelineNode): gold for current, the changed ring for a proposal, a faint ring for earlier and shelved states.
3. Lay the History tab out as events on a rail, with the row the reader is on raised under a quiet gold ring.
4. Use the same nodes in the About page's state lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified by captures of the History tab and the About page in both themes. record-rows.test.ts and the reader unit tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The History tab and the About timeline read as the site's history timeline: a rail of events, each with a node for where the state stands, the kind, the name, the date in mono and the recorded reason. The row the reader is on rises as a card with a quiet gold ring. Verified by captures in both themes and the reader unit tests.
<!-- SECTION:FINAL_SUMMARY:END -->
