---
id: TASK-500.24.06
title: 'src/, frontend/ and the @/ alias are removed'
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.24.05
parent_task_id: TASK-500.24
ordinal: 907000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the three apps are in, root src/ and frontend/ hold nothing. The @/ alias, the temporary #web/* entry and the old module-policy branches in the lint plugin are dead and are removed, and live docs name the final layout. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/ and frontend/ do not exist; @/ is gone from tsconfig, Vite and the lint resolver and a reintroduced legacy root is refused; the old module parser is deleted
- [ ] #2 docs/agents/boundaries.md, package-map.md, INSTALL.md, TESTING.md, AGENTS.md, docs/readme/assets.json, evals/coverage.json and the readme lockup test name the final layout
- [ ] #3 bun run check passes
<!-- AC:END -->
