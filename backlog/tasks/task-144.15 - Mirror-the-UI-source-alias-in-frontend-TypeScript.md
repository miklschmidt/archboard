---
id: TASK-144.15
title: Mirror the UI source alias in frontend TypeScript
status: To Do
assignee: []
created_date: '2026-08-30 15:43'
updated_date: '2026-08-30 16:58'
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
Own the frontend TypeScript half of the single @/* -> ./src/* alias. Vite owns runtime resolution; TASK-144.17 later establishes the same mapping in root TypeScript. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tsconfig.frontend.json compilerOptions.paths contains exactly @/* mapped to [./src/*] and does not add baseUrl.
- [ ] #2 A self-contained frontend alias fixture proves a public @/ module resolves and an unknown alias fails under tsconfig.frontend.json; it makes no deep-import enforcement claim.
- [ ] #3 Bundler resolution/noEmit and existing frontend includes remain unchanged, with no second alias spelling.
- [ ] #4 Cross-project agreement belongs to TASK-144.17, deep-import policy to TASK-144.18, and shadcn dry-run to TASK-144.04.
<!-- AC:END -->
