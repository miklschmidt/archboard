---
id: TASK-144.15
title: Mirror the UI source alias in frontend TypeScript
status: To Do
assignee: []
created_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-144.02
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tsconfig.frontend.json
parent_task_id: TASK-144
priority: high
type: task
ordinal: 238000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the frontend TypeScript half of the single `@/* -> src/*` resolver alias in `tsconfig.frontend.json`. Vite owns the matching runtime alias in TASK-144.02; root TypeScript does not include frontend/UI source and receives no unused alias.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 baseUrl and paths resolve @/* to src/* for every generated and owned UI import covered by the frontend project.
- [ ] #2 The alias matches Vite exactly, introduces no second alias namespace, and components.json uses only paths beneath the named src/ui modules.
- [ ] #3 Frontend type-check rejects an unresolved or mismatched alias and the root TypeScript project remains unchanged.
<!-- AC:END -->
