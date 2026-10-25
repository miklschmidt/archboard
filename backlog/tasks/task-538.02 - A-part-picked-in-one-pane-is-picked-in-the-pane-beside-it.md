---
id: TASK-538.02
title: A part picked in one pane is picked in the pane beside it
status: To Do
assignee: []
created_date: '2026-10-25T17:06:00Z'
labels:
  - compare
  - ui
dependencies: []
parent_task_id: TASK-538
type: feature
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
To compare two designs part by part, a person picks a part on one side and must find it on the other. Today each pane owns its own pick, and nothing links them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When both panes show the same board of the same vault, a pick in either pane picks the same part in the other, and letting go clears both
- [ ] #2 Only the pane where the person picked reports the pick as made by hand
- [ ] #3 A pane whose variant lacks the part names the variant that has it, and does not say that the part left the board
- [ ] #4 A drill-down, another board or a presented walkthrough ends the link
<!-- AC:END -->
