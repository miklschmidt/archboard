---
id: TASK-143.06.04
title: Retire the legacy injection command surface
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.14
  - TASK-143.06.02
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/engine/injection.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove `src/runtime/engine/injection.ts` and its direct CLI/server/test/documentation surface after exact semantic delivery and the workbench gateway exist. This leaf removes the importer and public experiment before the now-unused control module.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The injection command, route, status, experiment flags, configuration, and obsolete direct tests are removed rather than retained as a second path.
- [ ] #2 Existing change-feed and human responsiveness contracts remain unchanged and reach the named semantic-context server hook through one registration.
- [ ] #3 Repository, CLI, server, and browser checks prove no stale help, route, status, environment key, import of app-server-control, or fallback remains in the injection surface.
<!-- AC:END -->
