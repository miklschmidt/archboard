---
id: TASK-143.04.04
title: Render canonical voice transcript and cross-links
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.03.04
  - TASK-143.03.08
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-transcript
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own provisional/final transcript projection and display in `src/ui/voice-transcript`. It adds voice events to the coordinator view without becoming a second canonical thread history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional and canonical transcript events deduplicate deterministically and remain attributed to the exact realtime session and coordinator.
- [ ] #2 Delegation, queue, steer, approval, callback, and workhorse-result links point to canonical records without copying them into the transcript.
- [ ] #3 Late prior-session transcript, reconnect replay, interruption, processing, agent speech, completion, and failure remain ordered and inspectable.
- [ ] #4 The transcript is an accessible batched log and does not announce token-level updates.
<!-- AC:END -->
