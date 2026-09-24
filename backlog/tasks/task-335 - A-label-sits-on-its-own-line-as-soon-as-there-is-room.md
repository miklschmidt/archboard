---
id: TASK-335
title: A label sits on its own line as soon as there is room
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
updated_date: '2026-09-24 15:17'
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
<!-- SECTION:NOTES:END -->
