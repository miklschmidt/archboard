---
id: TASK-144.18
title: Teach Oxlint the canonical UI source alias
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-144.15
  - TASK-144.17
references:
  - docs/agents/boundaries.md
modified_files:
  - .oxlintrc.jsonc
  - tools/oxlint-plugin-archboard.js
  - tests/system/repository-policy/oxlint-ui-alias.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 249000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the narrow lint resolver/policy seam for @/ after both TypeScript aliases exist. Reuse the existing area, module-entrypoint, and deep-import rules; do not add Tailwind-specific custom lint or duplicate resolution policy. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Oxlint resolves @/ to ./src/ in both frontend and root TypeScript owners, and existing area/module-entrypoint/deep-import rules judge the resolved canonical path.
- [ ] #2 The change uses native resolver/config support where available and the smallest extension of the existing Archboard plugin otherwise; it adds no Tailwind-class rule, warning allowance, second alias table, or changing-upstream-default mirror.
- [ ] #3 Repository fixtures prove valid UI entrypoint imports pass while @/ deep imports, cross-area imports, unknown aliases, and paths escaping src fail with existing actionable rule names.
- [ ] #4 bun run lint remains deny-warnings clean and the alias policy matches Vite, root TypeScript, frontend TypeScript, and shadcn configuration.
<!-- AC:END -->
