---
id: TASK-515
title: 'Migrate build, lint, and formatting to Vite+'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 02:27'
updated_date: '2026-10-24 02:27'
labels: []
dependencies: []
references:
  - TASK-500
  - 'https://viteplus.dev/guide/migrate'
type: chore
ordinal: 922000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-500 left the Vite+ conversion as follow-up work. Contributors still install and invoke separate Vite, Oxlint, Oxfmt, and tsgolint versions. Use one pinned Vite+ release for these tools while preserving the Bun product runtime, the existing test lanes, and every lint rule. Retire the completed package map after preserving its remaining guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Build and development commands use Vite+ and the frontend retains its worker, WASM, font, and renderer digest behavior.
- [ ] #2 Lint and formatting use the tools bundled with the pinned Vite+ release, with all current rules, project-scope protections, and formatting exclusions preserved.
- [ ] #3 The complete bun run check gate passes with the existing Bun test lanes.
- [ ] #4 The completed package-map document is removed and live documentation retains its current guidance and the separate test-runner follow-up.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No architecture board is affected. The vault draws product processes and package contracts, which this tooling change preserves.
2. Pin Vite+ 1.4.0 and its Vite core alias. Route build, development, lint, formatting, plugin types, and repository fixture subprocesses through Vite+. Keep the two lint policies and the project-scope guard.
3. Put the format configuration and root lint entry in vite.config.ts. Preserve every rule and exclusion.
4. Remove the completed package map after moving unique current guidance and recording the separate Bun/Vitest trial.
5. Run focused tooling regressions, the frontend build, and the complete bun run check gate. Resolve observed failures, pause to simplify, and commit the finished change.
<!-- SECTION:PLAN:END -->
