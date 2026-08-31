---
id: TASK-144.18
title: Teach Oxlint the canonical UI source alias
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-31 03:06'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the existing Oxlint area/module-entrypoint/deep-import rules with the completed root, frontend, and Vite alias authorities. 2. Extend the narrow resolver seam so @/ maps once to ./src/ without Tailwind rules, duplicate alias tables, shadcn work, or changed defaults. 3. Add repository fixtures proving public UI entrypoints pass and deep, cross-area, unknown, and escaping aliases fail under existing actionable rule names. 4. Run focused resolver/policy, lint, type, format, inventory, and diff checks; leave broad repository/check lanes to the capped root owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.17 finalized at integration HEAD 6515ee1. This dependency-ready leaf owns .oxlintrc.jsonc, tools/oxlint-plugin-archboard.js, and tests/system/repository-policy/oxlint-ui-alias.test.ts; it is path-disjoint from active shell-token and formatter lanes.

Implemented in 7c88e33. The existing Oxlint source resolver now maps the single canonical @/ prefix to src/, preserves extension and query resolution, rejects alias escapes, and routes unresolved aliases through the existing archboard(module-entrypoints) rule. Added tests/system/repository-policy/oxlint-ui-alias.test.ts with real Oxlint subprocess fixtures covering public UI entrypoints, deep imports, cross-area imports, unknown and escaping aliases, and type/dynamic/require/query spellings. Focused evidence: bun test tests/system/repository-policy/oxlint-ui-alias.test.ts (4 pass, 23 expectations); bun test tests/system/repository-policy/boundaries.test.ts (9 pass, 76 expectations); bun test tests/system/repository-policy/test-inventory.test.ts (39 pass, 69 expectations); bunx tsc --noEmit --pretty false -p tsconfig.json (pass); bunx oxlint tools/oxlint-plugin-archboard.js tests/system/repository-policy/oxlint-ui-alias.test.ts (pass); bunx oxfmt --check tools/oxlint-plugin-archboard.js tests/system/repository-policy/oxlint-ui-alias.test.ts (pass); git diff --check (pass). Broad modules/system/repository/check/browser lanes intentionally not run; root owns capped broad validation. .oxlintrc.jsonc and /home/msc/Projects/archboard/src-DlBR1tzg.js preserved; source file sha256 observed as 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Acceptance criteria remain unchecked.
<!-- SECTION:NOTES:END -->
