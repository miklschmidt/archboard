---
id: TASK-143.04.02
title: Render persistent live voice controls
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-controls
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Start, Mute/Unmute, Stop, permission/negotiation progress, audio level, and persistent active transport in `src/ui/voice-controls`. It emits commands through the voice-session adapter and owns no media resources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Idle start explains required thread link, coordinator, experimental capability, microphone availability, and one-session exclusion before requesting permission.
- [ ] #2 Active controls always show text state, source pane/workhorse/coordinator, configured/effective model and service tier, Mute/Unmute, and Stop; analyser visualization is supplementary.
- [ ] #3 Stop remains reachable through workbench collapse and supported desktop/fullscreen modes and completes only after authoritative cleanup.
- [ ] #4 Keyboard, screen-reader text, non-color status, visible focus, reduced motion, both themes, and Samsung Flip touch targets are browser-tested.
<!-- AC:END -->
