---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.03
  - TASK-143.01.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tool-contract
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the byte-exact persisted dynamic-tool catalogue for coordinator thread creation in `src/runtime/codex-coordinator-tool-contract`. It defines closed manifests and result variants but dispatches no effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard_workhorse contains exactly inspect_workhorse, delegate_to_workhorse, manage_workhorse_queue, and steer_workhorse; archboard_voice contains exactly resolve_spoken_approval.
- [ ] #2 Every description, strict argument schema, success/refusal/approval-required/result variant, media restriction, and stable manifest hash is fixed by byte and schema fixtures.
- [ ] #3 The contract exposes no caller-selected child, pane, coordinator, workhorse, thread, turn, approval, or realtime-session identity and contains no wait tool.
- [ ] #4 Coordinator lifecycle consumes this catalogue at thread/start; attached threads never gain or replace persisted tools, and dispatch remains a separate module.
<!-- AC:END -->
