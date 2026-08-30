---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.11
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/codex-workbench
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `src/server/codex-workbench`: translate typed process/session/thread-link ports into the shared browser contract, validate commands, arbitrate one browser lease, and expose explicit start/replace-handlers/stop hooks to the canvas server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gateway exposes only shared DTOs/commands; generated protocol, credentials, rollout storage, process handles, and runtime objects never cross the browser boundary, and commands are rejected until composed readiness.
- [ ] #2 One browser lease presents reverse requests; lease loss asks codex-approvals for each generated terminal response before explicit transfer, while nonowners can only inspect.
- [ ] #3 Same-child reconnect rehydrates; replacement-child, lease, and thread failures remain visible/non-executable, and start/handler-replacement/stop hooks are idempotent without owning OS signals or canvas registration.
- [ ] #4 Tests in src/server/codex-workbench/tests cover DTO/command validation, lease settlement/transfer, reconnect, handler replacement, stop, stale commands, and fake broker/session ports; TASK-143.01.14 owns server lifecycle integration.
<!-- AC:END -->
