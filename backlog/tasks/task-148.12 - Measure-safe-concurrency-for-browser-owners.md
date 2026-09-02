---
id: TASK-148.12
title: Measure safe concurrency for browser owners
status: To Do
assignee: []
created_date: '2026-09-02 23:00'
labels: []
dependencies: []
references:
  - tests/system/browser/run-browser-lane.ts
  - docs/agents/test-suite.md
  - TASK-097
  - TASK-118
parent_task_id: TASK-148
ordinal: 284000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser owners already isolate HOME, XDG config/state, TMPDIR, browser namespace, vault, socket, and session, but the lane serializes all 19 owners due historical contention. Determine which owners can safely run concurrently without weakening frame/timing or cleanup evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Static ownership audit names every remaining shared machine resource and groups owners that can or cannot overlap.
- [ ] #2 Human-edit-performance remains exclusive unless new controlled evidence proves otherwise.
- [ ] #3 A bounded experiment compares serial and candidate concurrent groups for correctness, elapsed time, flake/timeout behavior, and complete cleanup.
- [ ] #4 No runner concurrency change is made without repeatable measured evidence; the task may conclude serialization is still required.
<!-- AC:END -->
