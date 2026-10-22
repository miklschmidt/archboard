---
id: TASK-502
title: CSS imports obey workspace package boundaries
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 01:53'
updated_date: '2026-10-22 02:00'
labels: []
dependencies: []
type: chore
ordinal: 909000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The web stylesheet reaches renderer assets through directory-relative paths. TypeScript lint enforces package interfaces, but CSS can reach private files without the same boundary rules. Maintainers need one import contract across authored source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CSS imports and asset URLs use local manifest imports or declared package exports, and lint refuses private package paths, imports of apps, and forbidden area directions.
- [ ] #2 The renderer declares the CSS and font assets that the web app consumes, and app.css uses those public names.
- [ ] #3 Tailwind source scanning remains explicit and the built stylesheet and emitted font assets remain equivalent.
- [ ] #4 Focused boundary regressions and bun run check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing import policy and resolver for parsed CSS references, and connect enforcement to normal lint. 2. Export the renderer assets that the app consumes and migrate CSS import and font paths. Keep Tailwind source globs as filesystem scan inputs. 3. Cover policy failures and valid imports with focused fixtures, compare built CSS and font assets, then run bun run check. No board is affected: the runtime parts and their existing dependencies stay the same.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The native Lightning CSS visitor reads CSS references in recovery mode because Tailwind extends the import syntax. Vite and Tailwind still own compilation. No dependency was added. CSS reuses the TypeScript package resolver and boundary predicates. The package graph now includes CSS and package assets. Focused CSS and graph tests passed (18 tests), and targeted production and test lint passed. The baseline build passed and its CSS and font assets are saved under /tmp/archboard-task502-baseline for comparison.
<!-- SECTION:NOTES:END -->
