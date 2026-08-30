---
id: TASK-143.01.09
title: Classify and bind current-epoch thread links
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
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
- [ ] #1 Thread discovery always paginates the explicit top-level source-kind allowlist and classifies current loaded/controllable, current loaded/unavailable, persisted notLoaded/ownership-unknown, prior-epoch inspect-only, and child-exit invalid states.
- [ ] #2 Only a current-epoch loaded controllable thread can form an executable thread link; all other states remain inspectable with exact refusal reasons and no input path.
- [ ] #3 A link is bound to one pane, child, epoch, and workhorse; active coordinator, dynamic-call, callback, queue-tail, approval, or realtime work blocks close/rebind until it settles or is explicitly stopped.
- [ ] #4 Tests prove no cold resume, replacement-child refusal, same-child rehydration, and exact one-link targeting without recent-thread heuristics.
<!-- AC:END -->
