---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:50'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.04
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
Own initialization, effective configuration/account readiness, stable app-server commands, authoritative non-realtime event reduction, and same-child hydration in `src/runtime/codex-session`. It exposes a stable session port; `src/runtime/codex-realtime` is the sole realtime binding adapter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initialization requests experimental APIs, then reads configRequirements/read, effective config/read, and account/read; readiness is refused unless effective SQLite home equals the process manifest and supported sign-in is ready.
- [ ] #2 The stable session port exposes account/login/start/cancel/logout, thread/list, thread/loaded/list, model/list, fully paginated turn/item/queue reads, turn start/steer/interrupt, reverse requests, raw phase-gated realtime commands/notifications, and shutdown without generated types.
- [ ] #3 The session reduces process, account, thread, turn, item, queue, approval, and tool state but owns no WebRTC, realtime phase machine, restart, transcript canonicalization, or callback append policy.
- [ ] #4 Same-child reconnect rehydrates; replacement invalidates state and never cold-resumes, forks, starts turns, dispatches queues, restores tools, or emits thread-only notifications before initialize/readiness.
- [ ] #5 Process-contract tests cover managed SQLite conflict, login start/cancel/success/failure/logout, partial events, pagination, unknown events, reconnect, crash/backoff, clean signal shutdown, and two-session isolation.
<!-- AC:END -->
