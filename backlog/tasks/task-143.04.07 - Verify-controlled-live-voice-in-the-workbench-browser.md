---
id: TASK-143.04.07
title: Verify controlled live voice in the workbench browser
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.03.13
  - TASK-143.04.01
  - TASK-143.04.02
  - TASK-143.04.03
  - TASK-143.04.04
  - TASK-143.04.05
  - TASK-143.04.06
  - TASK-143.04.10
  - TASK-143.07.04
  - TASK-143.07.05
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/codex-workbench-voice.test.ts
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the deterministic controlled-media serial-browser owner at `tests/system/browser/codex-workbench-voice.test.ts`. It verifies the full rendered voice lifecycle without requiring a real microphone or external realtime service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Controlled media, peer, audio, data-channel, transcript, semantic-context, callback, spoken-gate, and app-server fixtures reach every active, empty, progress, failure, recovery, and terminal voice state.
- [ ] #2 The test proves exact pane/thread/coordinator binding across focus changes, mute, Stop, same-thread serialized restart, child replacement, stale events, and all resource cleanup.
- [ ] #3 Voice never hides the text composer, queue, ordinary approvals, board status, source thread link, or Stop in one/two panes, collapse/expand, fullscreen, both themes, keyboard, and Samsung Flip touch layouts.
- [ ] #4 Accessible status, transcript batching, focus return, and visual/spoken approval fallback are asserted through rendered behavior.
<!-- AC:END -->
