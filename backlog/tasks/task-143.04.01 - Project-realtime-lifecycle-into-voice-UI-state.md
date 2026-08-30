---
id: TASK-143.04.01
title: Project realtime lifecycle into voice UI state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 16:35'
labels: []
dependencies:
  - TASK-143.02.02
  - TASK-143.02.03
  - TASK-143.03.01
  - TASK-143.07.01
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
Own the React-facing presentation adapter in src/ui/voice-session. It consumes only the public browser-native module state, the sole codex-realtime binding phase, and closed coordinator/session capabilities and exposes render-ready values without media/protocol objects. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Presentation covers unavailable, ready, permission, negotiating, listening, muted, processing, agent-speaking, recovering, stopping, stopped, permission/device/ICE/SDP/channel/realtime/app-server/coordinator failure, and actionable retry/terminal outcomes.
- [ ] #2 One session remains bound to its original pane/thread link/coordinator across focus changes; close/rebind guards are explicit, no second session starts, and restart follows codex-realtime stop/closed serialization.
- [ ] #3 The adapter never reduces protocol events, deduplicates transcripts, owns media, or chooses recovery; it projects the authoritative module/host-adapter state only.
- [ ] #4 Tests at src/ui/voice-session/tests exhaust mapping, same-child reconnect, replacement terminal state, late suppression, start/stop/restart, accessibility status text, and disposal.
<!-- AC:END -->
