---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.06.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-context
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show what the current voice session actually captured and what later context delivery did. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The panel renders the exact start brief captured for the active child/coordinator/realtime session, including repository, workhorse, coordinator, board, pane, version, selection/focus freshness, claim, doing, cursor, ambiguity, and truncation.
- [ ] #2 Later semantic/focus/selection/callback entries show attempted timestamp plus delivered, not_delivered, or outcome_unknown from the adapter; the UI never substitutes the publisher's current sample for what the session received.
- [ ] #3 Stale brief, session replacement, disconnected append, uncertain response, and history recovery are labelled against immutable session identity and remain inspectable after Stop.
- [ ] #4 Screen-reader structure, bounded expansion, copy behavior, and freshness language distinguish captured baseline from live delivery outcomes.
<!-- AC:END -->
