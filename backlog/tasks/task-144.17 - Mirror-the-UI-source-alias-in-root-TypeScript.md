---
id: TASK-144.17
title: Mirror the UI source alias in root TypeScript
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:49'
updated_date: '2026-08-31 02:46'
labels: []
dependencies:
  - TASK-144.15
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tsconfig.json
  - tests/system/repository-policy/tsconfig-root-alias.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the Tailwind adoption research, completed frontend alias owner, Vite alias owner, root TypeScript config, and repository test-inventory conventions. 2. Add exactly @/* -> [./src/*] to root tsconfig.json without baseUrl or another alias spelling, preserving bundler resolution, noEmit, and includes. 3. Add the smallest self-contained real-root-tsc fixture proving a public @/ import resolves and an unknown alias fails, without claiming deep-import enforcement. 4. Add stable cross-authority agreement checks for root TypeScript, frontend TypeScript, and Vite, then run focused compiler, inventory, lint, format, and diff checks for immutable review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.15 finalized and released this dependency-ready root TypeScript leaf at integration HEAD 6c992d9. It owns tsconfig.json plus the minimal alias/agreement fixture and is path-disjoint from every active lane.

Implemented in 1be7964. Focused evidence: bun test tests/system/repository-policy/tsconfig-root-alias.test.ts (3 pass); bunx tsc --noEmit -p tsconfig.json (pass); bun test tests/system/repository-policy/tsconfig-frontend-alias.test.ts (2 pass); bun test tests/system/repository-policy/test-inventory.test.ts (39 pass); bunx oxlint tsconfig.json tests/system/repository-policy/tsconfig-root-alias.test.ts (pass); bunx oxfmt --check tsconfig.json tests/system/repository-policy/tsconfig-root-alias.test.ts (pass); git diff --check (pass). The root fixture resolves the public @/ui/types entrypoint and independently rejects ~/ui/types; the agreement assertion confirms root TypeScript, frontend TypeScript, and Vite resolve the same src target without a deep-import claim. Scope audit: only tsconfig.json and tests/system/repository-policy/tsconfig-root-alias.test.ts changed; frontend tsconfig, Vite, package scripts, CI, Oxlint/deep-import policy, shadcn config, UI source, TASK-144.18, TASK-144.04, and src-DlBR1tzg.js were untouched. Acceptance criteria intentionally remain unchecked; broad gates remain parent-owned.
<!-- SECTION:NOTES:END -->
