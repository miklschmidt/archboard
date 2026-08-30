---
id: TASK-144.15
title: Mirror the UI source alias in frontend TypeScript
status: To Do
assignee: []
created_date: '2026-08-30 15:43'
updated_date: '2026-08-30 16:25'
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
- [ ] #1 compilerOptions.paths contains exactly @/* mapped to [./src/*] for the owning TypeScript config and does not add baseUrl.
- [ ] #2 A self-contained root alias fixture resolves a public @/ module and rejects an unknown/deep path under the owning tsc project without depending on pre-created shadcn components.
- [ ] #3 The mapping agrees with Vite and the peer TypeScript project, preserves bundler resolution/noEmit, and adds no second alias spelling.
- [ ] #4 TASK-144.04 owns the actual shadcn dry-run after both aliases and Oxlint resolution are ready.
<!-- AC:END -->
