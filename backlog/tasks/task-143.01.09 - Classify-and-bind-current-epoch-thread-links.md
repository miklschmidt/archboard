---
id: TASK-143.01.09
title: Classify and bind current-epoch thread links
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:39'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.08
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-thread-link
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own thread availability, ownership classification, explicit pane-to-workhorse binding, and rebind guards in `src/runtime/codex-thread-link`. It consumes session probes and epoch records and produces inspect-or-execute capabilities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Discovery paginates thread/list with the explicit top-level sourceKinds [cli, vscode, exec, appServer], joins thread/loaded/list, and classifies current loaded/controllable, current loaded/unavailable, persisted notLoaded/ownership-unknown, prior-epoch inspect-only, and child-exit invalid states.
- [ ] #2 Controllability requires a current loaded row for the same child plus canAcceptDirectInput === true from thread/loaded/list; false, null, missing, systemError, unknown source, or stale probes are inspect-only with exact refusal reasons.
- [ ] #3 Only a current-epoch loaded controllable thread can bind one pane/workhorse executable link; active coordinator, tool call, callback, queue tail, approval, or realtime work blocks close/rebind until settled or explicitly stopped.
- [ ] #4 Tests prove pagination, nonempty allowlist, no cold resume, replacement-child refusal, same-child rehydration, exact one-link targeting, and no recent-thread heuristic.
<!-- AC:END -->
