---
id: TASK-144.17
title: Mirror the UI source alias in root TypeScript
status: To Do
assignee: []
created_date: '2026-08-30 15:49'
labels: []
dependencies:
  - TASK-144.15
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tsconfig.json
parent_task_id: TASK-144
priority: high
type: task
ordinal: 244000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the root TypeScript half of the single `@/* -> src/*` resolver alias in `tsconfig.json`. This lets the pinned shadcn CLI resolve the project configuration and keeps root/frontend/Vite alias semantics identical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 baseUrl and paths resolve @/* to src/* exactly, matching TASK-144.02 Vite and TASK-144.15 frontend TypeScript with no second namespace.
- [ ] #2 Root type-check remains strict and no include/exclude, module resolution, emitter, or compiler safety option changes.
- [ ] #3 A shadcn configuration dry-run and both TypeScript checks reject an alias mismatch or unresolved named UI module.
<!-- AC:END -->
