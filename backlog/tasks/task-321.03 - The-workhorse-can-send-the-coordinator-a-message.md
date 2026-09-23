---
id: TASK-321.03
title: The workhorse can send the coordinator a message
status: To Do
assignee: []
created_date: '2026-09-23 23:38'
labels:
  - voice
  - coordinator
  - codex
dependencies: []
parent_task_id: TASK-321
priority: high
type: feature
ordinal: 559000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third slice of TASK-321: the workhorse needs a dynamic tool to tell the coordinator something while it works (a question, a milestone, a blocker), and its prompt says when to use it. The message reaches the coordinator the way workhorse outcomes do, only while voice is live; otherwise the tool says nobody is listening.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The workhorse has a dynamic tool that sends the coordinator one message, and its instructions say when to use it
- [ ] #2 While voice is live the message reaches the coordinator at once; with no voice session the tool answers that nobody is listening and nothing is sent
- [ ] #3 One owner proves both
<!-- AC:END -->
