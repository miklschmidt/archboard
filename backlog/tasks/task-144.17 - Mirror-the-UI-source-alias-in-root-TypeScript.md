---
id: TASK-144.17
title: Mirror the UI source alias in root TypeScript
status: To Do
assignee: []
created_date: '2026-08-30 15:49'
updated_date: '2026-08-30 16:58'
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
Own the root TypeScript half of the same @/* -> ./src/* alias and prove agreement with frontend TypeScript/Vite. Deep-import policy remains Oxlint-owned. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tsconfig.json compilerOptions.paths contains exactly @/* mapped to [./src/*] and does not add baseUrl.
- [ ] #2 A self-contained root alias fixture proves a public @/ module resolves and an unknown alias fails under root tsc; it does not claim path aliases reject valid deep imports.
- [ ] #3 The root mapping equals frontend/Vite, preserves bundler resolution/noEmit/includes, and adds no second spelling.
- [ ] #4 TASK-144.18 alone enforces module entrypoints/deep imports; TASK-144.04 owns the shadcn dry-run after both aliases.
<!-- AC:END -->
