---
id: TASK-143.06.04
title: Remove legacy injection from server and runtime
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 17:29'
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
  - tests/system/canvas-state/injection.test.ts
  - tests/system/canvas-state/support/injection-daemon.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/repository-policy/test-inventory.test.ts
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
- [ ] #1 Startup/application no longer reads ARCHBOARD_INJECT*, arms injection, exposes /api/injection or /api/injection/test, or holds a legacy injector singleton; removed routes use the ordinary unknown-route contract.
- [ ] #2 The change feed retains human responsiveness and semantic source while removing only the control-socket subscriber; no server/runtime import reaches injection.ts or app-server-control.ts.
- [ ] #3 In the same green change, the importing canvas-state injection owner/daemon are retired or rewritten, browser support removes injection routes/fixtures, and repository test inventory removes the retired owner without changing the 19 browser-owner baseline.
- [ ] #4 Canvas-state/process/browser/repository tests prove no control-socket client, removed routes, unchanged board/change-feed behavior, one private stdio graph, and no missing/duplicate test owner.
<!-- AC:END -->
