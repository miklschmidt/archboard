---
id: TASK-321.01
title: 'Workhorse news reaches the coordinator at once, and only while voice is live'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 23:38'
updated_date: '2026-09-23 23:47'
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
- [x] #1 While voice is live, a reported workhorse outcome calls turn/start on the coordinator at once, whatever the coordinator is doing, and never waits for it to be idle
- [x] #2 No workhorse outcome is injected into the coordinator thread; the thread_inject_items path is gone from the callbacks
- [x] #3 With no voice session, or while a recording holds the voice, an operation outcome is recorded and sent to nobody
- [x] #4 The report text reads right whether it starts a turn or is added to one already answering something else
- [x] #5 Unit owners prove the immediate start and the record-only paths; DESIGN.md and the authored-contracts doc describe them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Contract: the turn port result loses "busy" and gains "recording"; the thread_inject_items path, the payload field and the session option go.
2. deliver.ts: an operation outcome with no voice is recorded (voice_inactive); a reported one while voice is live goes to the port; recording is recorded; no injection anywhere.
3. Outcome report port: no idle wait; turn/start at once (Codex steers a running turn or starts one); prompt worded for either.
4. Bindings, timing (COORDINATOR_IDLE_WAIT_MS goes), tests, DESIGN.md and the authored-contracts doc.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Codex 0.155.1 turn/start is start-or-steer (core session/turn_input.rs), so the outcome report now calls turn/start the moment an outcome arrives: it joins the coordinator's running turn or starts one. Removed the idle wait (COORDINATOR_IDLE_WAIT_MS), the busy result, the thread_inject_items path, the delivery payload field and the callbacks' session option. With no voice session an operation callback is recorded voice_inactive; while a recording holds the voice the port answers recording and the callback is recorded voice_inactive. The report text now says "Workhorse news" and tells the coordinator to fold it into its [FINAL] when it is answering something else, and to start no new work. The callbacks harness got a turn port that records reports and honors the mutation modes, and the race tests run through the coordinator and voice routes. Gate lanes one at a time: type-check, lint, fmt:check, modules, system, repository, serial-browser all exit 0 (3568 tests, 0 failures).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workhorse outcomes now reach the coordinator at once through one turn/start, which Codex adds to a running turn or starts a turn with; nothing waits for an idle coordinator, nothing is injected into its history, and nothing is sent without voice or during a recording. Verified by the callback and outcome report unit owners and all gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
