---
id: TASK-336
title: A route does not loop away from its target and back
status: Done
assignee: []
created_date: '2026-09-24 13:59'
updated_date: '2026-09-27 06:17'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 577000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on Browser application (2026-09-24): the relationship 'restore through the workspace port' leaves Workspace routing downward and loops back up to Application composition instead of taking the short way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Browser application relationship takes a route without the loop
- [x] #2 One test owner fails without the fix
- [x] #3 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed by 75fe3d84 (Graphviz ranks a reserved label between its line's ends in a cycle), on visual-polish. Verified 2026-09-27 at 9b379274: Browser application whole under Graphviz draws 'restore through the workspace port' (zfz9dQDf) from Workspace routing straight up to Application composition with no reversal on either axis. Under Track it steps sideways round its own label and under Blocks it takes the left gutter; neither loops away from its target and back. label-chains.test.ts 'each reserved label of two lines that answer each other ranks between its ends' fails with orientLabelChains removed and passes with it. The Graphviz review rounds 4-8 rendered every dogfood view (49 drawings, no errors) and looked at each changed picture.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Browser application relationship no longer loops: Graphviz now ranks a reserved label between its line's ends in a cycle (75fe3d84). Verified by rendering the board under all three engines and by the label-chains owner test, which fails without the fix.
<!-- SECTION:FINAL_SUMMARY:END -->
