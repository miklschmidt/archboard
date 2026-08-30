---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser package
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.02.01
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/runtime/codex-realtime
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the Archboard host adapter in `src/runtime/codex-realtime`. It maps the reviewed 0.151.0 realtime RPC/notification surface to the standalone package without exposing generated types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every start mints a unique realtimeSessionId; active state requires RPC success plus `thread/realtime/started` matching exact child epoch, coordinator thread, realtime session, and version `v3`.
- [ ] #2 Offer/answer, realtime events, append speech, developer `thread/realtime/appendText`, close, and disconnect map through the package adapter; unsupported output-audio WebSocket behavior never crosses the boundary.
- [ ] #3 Before every active append, the adapter compares captured child epoch, coordinator, and realtime session with the current binding so late prior-session delivery is inert.
- [ ] #4 Tests cover non-v3 or mismatched-session refusal, stale/closed append refusal, same-child recovery, device and transport failure, and package consumption through only its public export.
<!-- AC:END -->
