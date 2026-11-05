---
id: TASK-579.03
title: A release server names its version, and restart builds nothing
status: To Do
assignee: []
created_date: '2026-11-05T14:58:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/server-lifecycle/src/runtime/services/staleness.ts
  - packages/server-lifecycle/src/runtime/operations/restart.ts
  - apps/cli/src/cli/operations/server/status.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1024000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release never changes on disk except by an install, and npm normalizes file times, so the module-time staleness check says nothing after an upgrade. ADR 0075 decides a warning that names `archboard restart`, not a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `/health` reports the version and the mode
- [ ] #2 When the running server version differs from the installed one, `archboard status` and other commands warn on stderr and name `archboard restart`; commands still work
- [ ] #3 In release mode `archboard restart` stops and starts the server and runs no build
<!-- AC:END -->
