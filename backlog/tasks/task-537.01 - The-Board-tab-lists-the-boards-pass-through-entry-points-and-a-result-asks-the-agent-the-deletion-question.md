---
id: TASK-537.01
title: >-
  The Board tab lists the board's pass-through entry points, and a result asks
  the agent the deletion question
status: To Do
assignee: []
created_date: '2026-10-25T17:03:00Z'
labels:
  - design-questions
  - ui
dependencies: []
parent_task_id: TASK-537
type: feature
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of TASK-537. It proves the region, the pick and the question to the agent from end to end on the board on screen. It needs no ADR change, because ADR 0044 already names pass-through entry points in words wherever an interface is listed.

It also adds the way a pane asks the agent a question. Today only the diagnostics bell can ask (`Application.tsx`). TASK-539 reuses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a board whose containers have pass-through entry points, the Board tab shows a Design questions region with the question, its count, and each result named by its container and part
- [ ] #2 Choosing a result picks the part on the picture
- [ ] #3 Ask the agent makes the pane's checkout active and sends one message that names the vault, the board, the variant and the part, and tells the agent to change nothing
- [ ] #4 The ask control is absent on a page that has no agent, such as a recording page
- [ ] #5 The answer type holds counts and lists only, so nothing in it can hold a score
- [ ] #6 On Command interface, the region lists the 13 pass-through entry points of Commands
<!-- AC:END -->
