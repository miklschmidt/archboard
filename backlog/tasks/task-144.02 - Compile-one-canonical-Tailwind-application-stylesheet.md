---
id: TASK-144.02
title: Configure Tailwind 4 in Vite
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:30'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - vite.config.js
parent_task_id: TASK-144
priority: high
type: task
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure Tailwind 4's Vite plugin and @/ runtime alias. Verification here uses a disposable self-contained Vite/Tailwind/alias fixture; production stylesheet and shell proof belong to TASK-144.13-.14.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 vite.config.js registers the pinned @tailwindcss/vite plugin once and maps @/ to the absolute repository src directory without changing frontend root, proxy, Excalidraw handling, or output naming.
- [ ] #2 A disposable fixture imports Tailwind, scans a static class through the @/ alias, and proves generated utility output with no dependence on production app.css, shell.tsx, or later tasks.
- [ ] #3 Missing plugin, wrong alias target, alias escape, duplicate plugin, and production config drift fail with actionable fixture output.
- [ ] #4 The task claims only configuration/fixture behavior; rendered production proof remains owned by TASK-144.13, TASK-144.14, and TASK-144.11.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update vite.config.js with one @tailwindcss/vite plugin registration and one absolute @/ alias rooted at this repository’s src directory, preserving the existing frontend root, output naming, proxy, and Excalidraw worker handling.
2. Add one self-contained repository-policy owner that creates a disposable Vite fixture, loads the canonical config behavior, imports Tailwind from an aliased fixture module, and asserts generated utility CSS.
3. Add independent negative fixture cases for absent/duplicate Tailwind plugin, wrong or escaping alias targets, and production-config drift, with actionable build/config failures.
4. Run the focused owner and proportionate repository, type, lint, format, and frontend-build checks; preserve unrelated work and leave task completion to the parent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the Vite Tailwind plugin, canonical @/ alias, and self-contained fixture proof; production stylesheet and rendered-shell behavior remain protected.

Implemented the canonical Vite seam and disposable proof. `vite.config.js` now registers `@tailwindcss/vite` once and maps `@` to the absolute repository `src`; `tests/system/repository-policy/vite-tailwind-contract.test.ts` builds an isolated Tailwind fixture and rejects missing/duplicate plugin, wrong/escaping alias, and production-config drift with actionable diagnostics. Focused fixture, repository-policy, module, type, lint, format, and frontend-build checks pass.
<!-- SECTION:NOTES:END -->
