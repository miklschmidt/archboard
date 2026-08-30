---
id: TASK-143.03.12
title: Pin the assistant-ui runtime dependency
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 15:51'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - package.json
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root dependency update for the text workbench runtime. Pin `@assistant-ui/react` 0.15.17 exactly and update `bun.lock`; do not add Assistant Cloud, AI SDK transports, voice, diff, syntax, or copied Elements packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock contain exact @assistant-ui/react 0.15.17 as the sole direct assistant-ui runtime dependency after TASK-144.01.
- [ ] #2 A frozen Bun install, root type-check, and production frontend build resolve React 19; assistant-cloud may remain a package-transitive lock entry but is never a direct dependency, application import, transport, or production bundle module.
- [ ] #3 Dependency inspection excludes direct Assistant Cloud, AI SDK, voice, diff, syntax, and copied Elements packages and proves every assistant-ui adapter task depends on this serialized package.json owner.
<!-- AC:END -->
