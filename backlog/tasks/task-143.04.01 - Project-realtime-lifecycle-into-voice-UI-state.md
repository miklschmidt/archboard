---
id: TASK-143.04.01
title: Project realtime lifecycle into voice UI state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.02.02
  - TASK-143.02.03
  - TASK-143.03.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-session
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the React-facing presentation adapter in `src/ui/voice-session`. It consumes only the private realtime package state plus closed coordinator/session capabilities and exposes render-ready states without media or protocol objects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Presentation covers unavailable, ready, permission, negotiating, listening, muted, processing, agent speaking, recovering, stopping, stopped, permission/device/ICE/SDP/channel/realtime/app-server/coordinator failures, and actionable recovery.
- [ ] #2 One active session remains bound to the original pane/thread link/coordinator across focus changes; close or rebind guards are explicit and no second session can start.
- [ ] #3 Unit tests prove exhaustive mapping, same-child reconnect, replacement-child terminal state, late-event suppression, and adapter disposal.
<!-- AC:END -->
