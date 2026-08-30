---
id: TASK-143.04.10
title: Keep live voice Stop reachable in fullscreen
status: To Do
assignee: []
created_date: '2026-08-30 15:42'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.04.06
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/shell/tests/codex-voice-presentation.test.tsx
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the existing PresentationDock in Shell.tsx with the active voice source and Stop action; do not create another dock or fullscreen state owner. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The same PresentationDock identifies active voice pane, workhorse, coordinator, realtime session, mute/phase, and retains one labelled Stop control across enter/exit fullscreen and focus/navigation changes.
- [ ] #2 Stop routes to the immutable active voice session rather than the focused pane; stale/closed/outcome-unknown states remain visible until authoritative reconciliation.
- [ ] #3 Shell CSS preserves the accepted dock hierarchy, 44px touch target, keyboard focus, high contrast, reduced motion, and no overlay collision at desktop and Flip sizes.
- [ ] #4 The named module test proves one dock/state owner, text-only, voice-only, simultaneous text/voice, stale session, unmount/reload, and exact Stop routing; browser rendering remains TASK-143.04.07.
<!-- AC:END -->
