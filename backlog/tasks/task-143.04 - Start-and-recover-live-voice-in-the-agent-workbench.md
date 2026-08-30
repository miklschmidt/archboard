---
id: TASK-143.04
title: Build the live voice UI and end-to-end recovery
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 15:44'
labels: []
dependencies:
  - TASK-143.02
  - TASK-143.03
  - TASK-143.07
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for voice projection, controls, visible context, canonical transcript, spoken-approval presentation, frame/fullscreen composition, controlled browser coverage, inventory registration, and final real-audio acceptance delivered by TASK-143.04.01-.10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One live voice session attaches to the linked coordinator and stays bound to its source pane/workhorse across focus changes until explicit Stop, matching closed state, and complete cleanup.
- [ ] #2 Permission, negotiation, listening, mute, processing, speech, context, transcript, spoken approval, every recoverable/terminal failure, same-child recovery, serialized restart, and fullscreen Stop are visible/accessibly testable.
- [ ] #3 Voice-specific eligibility/race disclosure and visual fallback are owned here; transcript truth comes only from the realtime adapter and reusable approval cards remain in TASK-143.03.
- [ ] #4 Module tests, controlled browser owner, canonical inventory registration, and the final documented clean-process microphone/speaker smoke prove Archboard context, delegation/queue/steer, callbacks, approval, restart, and shutdown.
<!-- AC:END -->
