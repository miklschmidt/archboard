---
id: TASK-143.06.03
title: Retire the legacy app-server control module
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.06.02
references:
  - docs/adr/0005-bystander-injection.md
modified_files:
  - src/runtime/engine/app-server-control.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the environment-routed `src/runtime/engine/app-server-control.ts` path after linked delivery is available. This leaf owns deletion of that module and migration of its direct runtime consumers only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No runtime code discovers a standalone control socket, configured thread ID, Desktop app-server, or recent thread for board-change delivery.
- [ ] #2 Legacy `ARCHBOARD_INJECT` and thread-route environment handling owned by this module is removed; the typed thread-context port is the sole replacement.
- [ ] #3 Focused runtime and repository searches/tests prove the deleted module has no import, environment, status, or fallback path.
<!-- AC:END -->
