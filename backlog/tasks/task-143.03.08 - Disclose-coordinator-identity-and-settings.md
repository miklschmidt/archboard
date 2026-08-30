---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.04
  - TASK-143.07.01
  - TASK-144.07
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-coordinator
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the separate coordinator disclosure and global settings UI in `src/ui/workbench-coordinator`. It displays the coordinator timeline and configuration without merging it into the workhorse conversation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty/creating/ready/active/reconnecting/invalidated/failed coordinator views name coordinator and linked workhorse, configured/effective model/effort/service tier, intervention policy, pending callback, and navigation between separate timelines.
- [ ] #2 Settings start Luna/medium/Explicit corrections, expose Coordinator judgment and Never steer, validate only model/list combinations, and affect later decisions without rewriting the current turn.
- [ ] #3 Unavailable model/effort, priority fallback, creation failure, child replacement, and stale settings are actionable and never collapse coordinator history into workhorse history.
- [ ] #4 Tests at src/ui/workbench-coordinator/tests cover the full state/settings matrix, focus order, keyboard/touch operation, labels/status, cross-links, light/dark, and reduced motion.
<!-- AC:END -->
