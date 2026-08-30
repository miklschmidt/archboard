---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.07.01
  - TASK-143.03.02
  - TASK-143.03.04
  - TASK-144
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
- [ ] #1 The view names coordinator and linked workhorse identities, configured/effective model and effort, requested/effective service tier, intervention policy, active voice, pending callback, and navigation between timelines.
- [ ] #2 Settings begin with Luna/medium and Explicit corrections, show Coordinator judgment and Never steer, validate available combinations, and affect only later coordinator decisions.
- [ ] #3 Unavailable model/effort and priority fallback are actionable and visible; disclosure, settings, focus order, and separate timeline semantics work in both themes.
<!-- AC:END -->
