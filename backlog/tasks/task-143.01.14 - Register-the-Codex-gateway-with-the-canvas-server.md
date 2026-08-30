---
id: TASK-143.01.14
title: Register the Codex gateway with the canvas server
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
labels: []
dependencies:
  - TASK-143.01.10
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/canvas
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one mechanical canvas-server integration for the public Codex workbench gateway. Register its HTTP/WebSocket surface and process lifecycle once; no Codex protocol or state reduction enters `src/server/canvas`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Server startup creates one kept gateway/process/session owner, installs replaceable request handlers, and rejects browser commands until composed readiness.
- [ ] #2 Hot reload replaces handlers without another child/listener; SIGINT/SIGTERM and normal close await gateway stop, session shutdown, child reap, and pending reverse-request settlement.
- [ ] #3 Server process tests cover one registration, reload, port failure, command-before-ready, clean signal shutdown, and orphan-child refusal without altering existing canvas routes.
<!-- AC:END -->
