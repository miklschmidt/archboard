---
id: TASK-143.04
title: Build the live voice UI and end-to-end recovery
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 15:16'
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
Integration milestone for voice presentation state, persistent controls, visible context, canonical transcript, voice-specific spoken approval, and workbench composition delivered by TASK-143.04.01-.06.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One live voice session attaches to the linked coordinator and stays bound to its source pane/workhorse across focus changes until explicit Stop and complete cleanup.
- [ ] #2 Permission, negotiation, listening, mute, processing, agent speech, context, transcript, spoken approval, every recoverable/terminal failure, and same-child recovery are visible with text-equivalent accessible state.
- [ ] #3 Voice-specific spoken eligibility, exact speech/session correlation, expiry/race disclosure, and visual-only fallbacks are owned here; reusable ordinary cards remain in TASK-143.03.
- [ ] #4 Deterministic browser media tests and the documented real microphone/speaker smoke prove real coordinator understanding of Archboard context, delegation/queue/steer, callback speech, approval, restart, and shutdown.
<!-- AC:END -->
