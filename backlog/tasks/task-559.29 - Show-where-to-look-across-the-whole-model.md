---
id: TASK-559.29
title: Show where to look across the whole model
status: To Do
assignee: []
created_date: '2026-10-31T04:16:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.22
parent_task_id: TASK-559
priority: high
ordinal: 1001000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader answers where a design smells only for a person who already knows where to look. Which modules change most is CLI only. Audit rank 4. The server already answers for every part at once in LocalityAnswer, so one read holds hotspots and coupled pairs. ADR 0045:414 says that a selection makes the inspector ask, and the code waits for a button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A selection reads its code history with no button, as ADR 0045:414 says
- [ ] #2 A reader sees one list across the whole model, in reach of Diagram, of modules with their interface counts, commit counts and unjoined pairs, and can sort it by each
- [ ] #3 A row selects its module on the picture
- [ ] #4 An unread part states why, and no count is combined into a score
- [ ] #5 The owner accepts it by eye
<!-- AC:END -->
