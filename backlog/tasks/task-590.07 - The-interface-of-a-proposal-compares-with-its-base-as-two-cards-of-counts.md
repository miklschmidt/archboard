---
id: TASK-590.07
title: The interface of a proposal compares with its base as two cards of counts
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:48:00Z'
updated_date: '2026-11-07T13:46:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1050000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site interface comparison: one card for each state, with the module in display capitals, a state chip, the counts in wells, the entries as rows and the callers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A proposal read against its base shows the interface of a changed module in a card for each state
- [x] #2 Counts stand in wells, and a hidden entry is an outlined row
- [x] #3 The proposal card has the changed ring and chip
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derive each state's side of a changed module's interface from the comparison: the base first, its counts, its entry points, and the hidden parts and callers the two differ by (interface-changes.ts).
2. Render one card for each side in About's Interface section: the module in display capitals, the lifecycle chip, the counts in wells, entry rows and outlined hidden rows, and the changed ring and chip on the state read.
3. Share one map of lifecycle words with the History tab.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The cards stand in About's Interface section, which is wide enough for two cards side by side; the right panel is 360px. The comparison names every entry point of each state, but only the hidden parts and callers that the states differ by, so the cards list those. Verified by captures in both themes through canonical-model-comparison.test.ts, a unit test of the rule and a DOM test of the outlined hidden row.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A module whose interface a proposal changes now shows, in About's Interface section, one card for each state with the base first, as on the site's interface comparison: display-caps name, lifecycle chip, counts in wells, entry rows, outlined rows for parts hidden here, and the callers only one state has. The state read wears the changed ring and the solid chip. Verified by captures in both themes and by unit and DOM tests; the comparison and proposal browser tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
