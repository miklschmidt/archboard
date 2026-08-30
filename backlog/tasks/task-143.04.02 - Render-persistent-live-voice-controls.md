---
id: TASK-143.04.02
title: Render persistent live voice controls
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-144.14
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
- [ ] #1 Controls render unavailable, ready, requesting permission, negotiating, listening, muted, processing, agent-speaking, recovering, stopping, stopped, retryable failure, and terminal failure with exact bound identity.
- [ ] #2 Start, mute/unmute, retry when permitted, and Stop emit only explicit presentation-adapter commands; pending/repeated/late input is disabled with an actionable reason.
- [ ] #3 Level/waveform visualization is supplemental to named status, respects reduced motion, never animates after stop, and never exposes raw media objects.
- [ ] #4 Tests at src/ui/voice-controls/tests cover keyboard/pointer/touch, visible focus, labels/status, color independence, both themes, Samsung Flip targets, failure recovery, and disposal.
<!-- AC:END -->
