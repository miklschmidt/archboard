---
id: TASK-144.17
title: Mirror the UI source alias in root TypeScript
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:49'
updated_date: '2026-08-31 02:59'
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
- [x] #1 tsconfig.json compilerOptions.paths contains exactly @/* mapped to [./src/*] and does not add baseUrl.
- [x] #2 A self-contained root alias fixture proves a public @/ module resolves and an unknown alias fails under root tsc; it does not claim path aliases reject valid deep imports.
- [x] #3 The root mapping equals frontend/Vite, preserves bundler resolution/noEmit/includes, and adds no second spelling.
- [x] #4 TASK-144.18 alone enforces module entrypoints/deep imports; TASK-144.04 owns the shadcn dry-run after both aliases.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the Tailwind adoption research, completed frontend alias owner, Vite alias owner, root TypeScript config, and repository test-inventory conventions. 2. Add exactly @/* -> [./src/*] to root tsconfig.json without baseUrl or another alias spelling, preserving bundler resolution, noEmit, and includes. 3. Add the smallest self-contained real-root-tsc fixture proving a public @/ import resolves and an unknown alias fails, without claiming deep-import enforcement. 4. Add stable cross-authority agreement checks for root TypeScript, frontend TypeScript, and Vite, then run focused compiler, inventory, lint, format, and diff checks for immutable review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.15 finalized and released this dependency-ready root TypeScript leaf at integration HEAD 6c992d9. It owns tsconfig.json plus the minimal alias/agreement fixture and is path-disjoint from every active lane.

Implemented in 1be7964. Focused evidence: bun test tests/system/repository-policy/tsconfig-root-alias.test.ts (3 pass); bunx tsc --noEmit -p tsconfig.json (pass); bun test tests/system/repository-policy/tsconfig-frontend-alias.test.ts (2 pass); bun test tests/system/repository-policy/test-inventory.test.ts (39 pass); bunx oxlint tsconfig.json tests/system/repository-policy/tsconfig-root-alias.test.ts (pass); bunx oxfmt --check tsconfig.json tests/system/repository-policy/tsconfig-root-alias.test.ts (pass); git diff --check (pass). The root fixture resolves the public @/ui/types entrypoint and independently rejects ~/ui/types; the agreement assertion confirms root TypeScript, frontend TypeScript, and Vite resolve the same src target without a deep-import claim. Scope audit: only tsconfig.json and tests/system/repository-policy/tsconfig-root-alias.test.ts changed; frontend tsconfig, Vite, package scripts, CI, Oxlint/deep-import policy, shadcn config, UI source, TASK-144.18, TASK-144.04, and src-DlBR1tzg.js were untouched. Acceptance criteria intentionally remain unchecked; broad gates remain parent-owned.

Review remediation implemented in 18a75d0 on fixed BASE ece005deac3abc6b49fc2a83682cf6f7d90c5ea4. The disposable tsc fixture now uses OS tmpdir() with finally cleanup and a git-status before/after assertion proving no checkout residue; the fixture adds only temporary typeRoots so the real root config resolves ambient types from the repository installation. The Vite agreement now filters to the canonical find "@" alias, requires exactly one real src target, and does not reject unrelated aliases; existing Vite contract coverage continues to reject alternate/overlapping @ aliases and allow unrelated non-overlapping aliases. Focused evidence after remediation: root alias test 4 pass / 17 expectations; bunx tsc --noEmit -p tsconfig.json pass; frontend alias test 2 pass / 7 expectations; Vite contract 42 pass / 90 expectations; inventory 39 pass / 69 expectations; focused Oxlint, Oxfmt, and git diff --check pass. Acceptance criteria remain unchecked; broad gates remain parent-owned.

Independent same-reviewer rereview returned REVIEW_CLEAN for the fixed range. Root capped validation in archboard-task14417-focused-929a488.service passed 87 tests / 183 expectations across the root alias, frontend alias, Vite contract, and test inventory owners, followed by both root and frontend tsc; peak memory 1.4 GB, swap 0 under 6 GB/1 GB caps, with no cap hit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mirrored the canonical @/* source alias into root TypeScript and added a real-compiler fixture plus cross-authority TypeScript/Vite agreement checks. Review remediation moved fixtures outside the checkout and allowed unrelated Vite aliases while retaining overlap rejection. Independent review and capped focused validation passed.
<!-- SECTION:FINAL_SUMMARY:END -->
