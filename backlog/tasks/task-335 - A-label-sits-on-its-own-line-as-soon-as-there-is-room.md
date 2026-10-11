---
id: TASK-335
title: A label sits on its own line as soon as there is room
status: Done
assignee: []
created_date: '2026-09-24 13:59'
updated_date: '2026-10-11 13:55'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 576000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on Voice coordinator (2026-09-24): the label 'start the realtime leg' sits by Codex session at the far end of its long vertical line out of Realtime voice, where it reads as belonging to other lines. The user wants it placed on its line at the first place with room, here right after the bend of the 'is a recording holding the voice?' line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A relationship's label is placed on its own route at the first stretch long enough to hold it, counted from its source
- [ ] #2 One test owner fails without the fix
- [ ] #3 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision 2026-09-24: narrow the rule (option 3). A label sits at the first stretch from its source where its line runs alone: a stretch that shares its lane with other routes, or runs within a lane's width beside another route, does not count as room. The Voice coordinator fix stays; fan-out bundles (Command interface, Skill evaluation) must not collect labels.

2026-10-11 audit and user decision: close as superseded. The bug was seen under the Graphviz engine, which ADR 0040 deleted (2026-09-27). On the two engines that remain (Track and Blocks) the Voice coordinator example now puts 'start the realtime leg' on its own line in the first stretch below Realtime voice. Neither engine has a general 'first stretch where the line runs alone' rule, and the user does not want one built. This replaces the 2026-09-24 decision to narrow the rule.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed as superseded, not delivered. The label bug was reported against the Graphviz engine, which ADR 0040 removed. On Track and Blocks the reported example draws correctly (checked 2026-10-11 by rendering Voice coordinator on both). The general placement rule was not built, by the user's decision, so ACs 1 to 3 stay unchecked. Reopen as a new task if a label reads as belonging to the wrong line on Track or Blocks.
<!-- SECTION:FINAL_SUMMARY:END -->
