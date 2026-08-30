---
id: TASK-143.06.04
title: Remove legacy injection from server and runtime
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.06.02
  - TASK-143.01.14
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/canvas/lib/application.ts
  - src/runtime/engine/injection.ts
  - src/runtime/engine/change-feed.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove legacy injection startup, routes, status/test handlers, change-feed subscriber, and runtime module after semantic linked delivery is composed. Keep historical ADR/research intact. Delegation profile: gpt-5.6-sol, medium for the cross-module removal seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Canvas startup/health/application no longer reads ARCHBOARD_INJECT*, arms injection, exposes /api/injection or /api/injection/test, or holds a legacy injector singleton.
- [ ] #2 The existing change feed retains human responsiveness and its public semantic source while removing only the legacy control-socket subscriber and injection-specific commentary.
- [ ] #3 No server/runtime import reaches injection.ts or app-server-control.ts; the replacement production graph owns all Codex delivery through the private stdio session.
- [ ] #4 Server/process tests prove removed routes return the ordinary unknown-route contract and startup creates no control-socket client while current board/change-feed behavior is unchanged.
<!-- AC:END -->
