---
id: TASK-143.06.04
title: Retire the legacy injection command surface
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.06.03
references:
  - docs/adr/0005-bystander-injection.md
modified_files:
  - src/runtime/engine/injection.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove `src/runtime/engine/injection.ts` and the corresponding CLI/server route surface after semantic thread delivery is proven. This leaf owns the obsolete public injection seam and its direct tests/docs, not the new context module.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The injection command, route, status, loud experiment, configuration, and obsolete test surface are removed rather than retained as a second control path.
- [ ] #2 Existing change-feed and board responsiveness contracts remain unchanged and the semantic publisher is reached through its named module boundary.
- [ ] #3 Repository, CLI, server, and browser checks prove no stale help text, route, environment key, or source import remains.
<!-- AC:END -->
