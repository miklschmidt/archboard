---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.05
  - TASK-143.01.06
  - TASK-143.01.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-session
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own initialization, app-server commands, authoritative event reduction, and same-child hydration in `src/runtime/codex-session`. The session consumes process, transport, protocol, epoch, and instruction ports and exposes no generated types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initialization requests experimental APIs and reports protocol readiness truthfully; every experimental operation remains unavailable until its own typed success path completes.
- [ ] #2 Thread/list, thread/loaded/list, model/list, turn/item pagination, turn start/steer/interrupt, queue, realtime, reverse requests, and shutdown reduce into the shared browser contract with every cursor exhausted where required.
- [ ] #3 Browser reconnect to the same child rehydrates the session; child replacement invalidates state and never cold-resumes, forks, starts turns, dispatches queues, or restores tools automatically.
- [ ] #4 Process-contract tests cover fresh start, partial event streams, unknown events, reconnect, crash/backoff, clean shutdown, and two-session isolation.
<!-- AC:END -->
