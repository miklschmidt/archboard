---
id: TASK-321.01
title: 'Workhorse news reaches the coordinator at once, and only while voice is live'
status: To Do
assignee: []
created_date: '2026-09-23 23:38'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-321
priority: high
type: bug
ordinal: 557000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First slice of TASK-321. Codex 0.155.1 turn/start is start-or-steer (core session/turn_input.rs start_or_steer): it steers the running turn when there is one and starts a turn otherwise. So the outcome report can call turn/start the moment news arrives, with no wait for an idle coordinator and no fallback that injects the news into the coordinator thread without a turn. With no voice session, and while a recording holds the voice, nothing goes to the coordinator.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While voice is live, a reported workhorse outcome calls turn/start on the coordinator at once, whatever the coordinator is doing, and never waits for it to be idle
- [ ] #2 No workhorse outcome is injected into the coordinator thread; the thread_inject_items path is gone from the callbacks
- [ ] #3 With no voice session, or while a recording holds the voice, an operation outcome is recorded and sent to nobody
- [ ] #4 The report text reads right whether it starts a turn or is added to one already answering something else
- [ ] #5 Unit owners prove the immediate start and the record-only paths; DESIGN.md and the authored-contracts doc describe them
<!-- AC:END -->
