---
id: TASK-559.24
title: Stop drawing a line between a module and its own part
status: To Do
assignee: []
created_date: '2026-10-31T03:36:00Z'
labels:
  - board
  - renderer
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-559
priority: high
ordinal: 996000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw a line leave the corner of the Agent CLI tab, cross the frame and end on Clipboard owner, and could not tell what it meant. It is an authored relationship from a module to a part that it holds. ADR 0052 says such a line means nothing, because the nesting already shows it, that archboard check warns with CONTAINER_LINE_TO_OWN_PART, and that a call inside a container starts at the part that makes it. Pull request 19 lost that check. This repository has 30 such relationships of 1,098, and every one of them draws.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No reading draws a line between an open module and a part that it holds, near or far, in any comparison
- [ ] #2 The relationship stays listed in the panel and About, so nothing disappears from the model
- [ ] #3 archboard check warns with CONTAINER_LINE_TO_OWN_PART on each such relationship, and a write can still store one
- [ ] #4 Each of the 30 relationships in this repository starts at the part that makes the call, or is removed if the source shows that no such call exists, through model operations with the code as evidence
- [ ] #5 archboard check reports none of them afterwards
<!-- AC:END -->
