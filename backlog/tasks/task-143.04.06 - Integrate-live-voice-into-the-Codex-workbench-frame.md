---
id: TASK-143.04.06
title: Integrate live voice into the Codex workbench frame
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.03.10
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
Extend only `src/ui/workbench-frame` to compose voice controls, context, transcript, and voice-specific spoken approval while preserving the text workbench as the canonical fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice start, active transport, context, transcript, and spoken state occupy the approved operator workbench regions without hiding text composer, ordinary approvals, queue, claim/doing, or Stop.
- [ ] #2 The source thread link remains visible and immutable across pane focus changes, workbench collapse, one/two panes, and fullscreen; terminal stop restores the normal text layout.
- [ ] #3 A deterministic browser owner uses controlled media, peer, audio, data-channel, transcript, semantic-context, callback, spoken-gate, and app-server fakes to prove the complete visible state and cleanup matrix.
- [ ] #4 A documented clean-process manual smoke against exact 0.151.0 and the dedicated signed-in home proves real audio, quick coordinator answer, one board write, busy-workhorse queue/steer behavior, callback speech, one eligible spoken approval, stop, restart, and shutdown.
<!-- AC:END -->
