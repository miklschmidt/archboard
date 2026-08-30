---
id: TASK-143.06.03
title: Retire the legacy app-server control module
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.06.04
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/engine/app-server-control.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete the now-unreferenced `src/runtime/engine/app-server-control.ts` module after TASK-143.06.04 removes its importer. This leaf owns deletion and repository proof only; replacement behavior already lives behind typed session/context modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No runtime code discovers or connects to an ambient control socket, configured thread route, Desktop app-server, or recent thread for board changes.
- [ ] #2 The module and its direct tests are deleted with no compatibility wrapper, environment handling, status path, or fallback.
- [ ] #3 Focused runtime and repository checks prove no source import, control-socket protocol, ambient selector, or legacy configuration remains and all typed replacement tests stay green.
<!-- AC:END -->
