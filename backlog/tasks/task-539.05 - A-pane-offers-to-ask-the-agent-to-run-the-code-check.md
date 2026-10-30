---
id: TASK-539.05
title: A pane offers to ask the agent to run the code check
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - code-check
  - ui
dependencies:
  - TASK-537.01
parent_task_id: TASK-539
type: feature
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pane never starts a code pass (TASK-367.24). When no pass has run, or the board changed after it, the Exposed names region and the Design questions region have nothing to show. One control asks the agent to run it, through the pane ask that TASK-537.01 adds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When no pass has run, or the board on screen changed after the pass, the region offers a control that asks the agent to run archboard check --code for this vault
- [ ] #2 For a draft, the request names the variant
- [ ] #3 Exposed names and Design questions use the same control
<!-- AC:END -->
