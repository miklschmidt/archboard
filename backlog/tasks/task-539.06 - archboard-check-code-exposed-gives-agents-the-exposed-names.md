---
id: TASK-539.06
title: archboard check --code --exposed gives agents the exposed names
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - code-check
  - cli
dependencies:
  - TASK-539.01
parent_task_id: TASK-539
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI is the default surface (ADR 0008), so an agent in the survey or grilling step reads the same exposed names as the pane. The owner decided on 2026-10-25 that this is opt-in, so an ordinary check stays small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --exposed requires --code
- [ ] #2 With --exposed, the JSON answer carries the exposed names of each judged container with the same caps as the pane, and the text output gives one line per container
- [ ] #3 Without --exposed, the answer is unchanged
- [ ] #4 The consumer skill teaches the flag, and the evaluation inputs cover it
<!-- AC:END -->
