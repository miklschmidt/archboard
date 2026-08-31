---
id: TASK-144.15
title: Mirror the UI source alias in frontend TypeScript
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:43'
updated_date: '2026-08-31 02:38'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the Tailwind adoption research, Vite alias owner, frontend TypeScript configuration, and existing public UI module boundaries. 2. Add exactly @/* -> [./src/*] to tsconfig.frontend.json without baseUrl or another alias spelling. 3. Add the smallest self-contained frontend alias fixture proving one public @/ import resolves and an unknown alias fails while preserving existing includes and noEmit behavior. 4. Run focused TypeScript/config/inventory checks and submit the immutable range for independent review; leave cross-project, deep-import, and shadcn work to their named tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.02 finalized and released this dependency-ready configuration leaf at integration HEAD a6957cc. It owns tsconfig.frontend.json plus the minimal self-contained fixture and is path-disjoint from every active lane.

Implemented in f9681543c732c4364c949513ed8137f6fc855b9d. Focused evidence: `bun test tests/system/repository-policy/tsconfig-frontend-alias.test.ts` (2 pass); `bunx tsc --noEmit -p tsconfig.frontend.json` (pass); `bunx oxfmt --check tsconfig.frontend.json tests/system/repository-policy/tsconfig-frontend-alias.test.ts` (pass); `bunx oxlint tsconfig.frontend.json tests/system/repository-policy/tsconfig-frontend-alias.test.ts` (pass); `bun test tests/system/repository-policy/test-inventory.test.ts` (39 pass). Scope audit: only tsconfig.frontend.json and the focused alias test changed; Vite, root tsconfig, package scripts, CI, deep-import policy, shadcn config, other alias tasks, and src-DlBR1tzg.js were untouched. Broad gates remain owned by the parent. Acceptance criteria intentionally remain unchecked.
<!-- SECTION:NOTES:END -->
