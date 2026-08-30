---
id: TASK-144.18
title: Teach Oxlint the canonical UI source alias
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 17:27'
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
- [ ] #1 Oxlint resolves @/ to ./src/ consistently with Vite and both TypeScript owners; existing area/module-entrypoint/deep-import rules judge the canonical path.
- [ ] #2 The smallest native resolver/plugin extension adds no Tailwind rule, warning allowance, second alias table, changing-default mirror, components.json read, or shadcn dry-run.
- [ ] #3 Repository fixtures prove valid UI entrypoints pass while deep, cross-area, unknown, and escaping paths fail with existing actionable rule names.
- [ ] #4 bun run lint stays deny-warnings clean. TASK-144.04 alone validates components.json agreement and runs shadcn after this alias owner completes.
<!-- AC:END -->
