---
id: TASK-143.04.06
title: Integrate live voice into the Codex workbench frame
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.04.02
  - TASK-143.04.03
  - TASK-143.04.04
  - TASK-143.04.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-frame
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend only `src/ui/workbench-frame` to fill its optional voice slot with controls, context, transcript, and spoken-approval presentation. Preserve the text workbench as canonical fallback; fullscreen projection is a separate shell leaf.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice ready/start/active/recovering/stopping/failure states occupy the approved regions without hiding text composer, ordinary approvals, queue, board status, source thread link, or Stop.
- [ ] #2 The bound source link remains visible and immutable across pane focus, one/two panes, collapse/expand, and frame-level failure; terminal stop restores the text-only layout with no stale slot content.
- [ ] #3 Frame tests at src/ui/workbench-frame/tests/voice-composition.test.ts cover every voice-slot state, focus/log order, both themes, reduced motion, keyboard/pointer/touch, and no duplicate state owner.
- [ ] #4 This leaf owns no browser inventory or real-audio smoke; deterministic integration belongs to TASK-143.04.07 and real acceptance to TASK-143.04.09.
<!-- AC:END -->
