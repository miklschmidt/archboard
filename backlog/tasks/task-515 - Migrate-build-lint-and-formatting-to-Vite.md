---
id: TASK-515
title: 'Migrate build, lint, and formatting to Vite+'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 02:27'
updated_date: '2026-10-24 03:21'
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
1. Pin Vite+ 1.4.0 and its Vite core alias. Use bundled build, lint, formatting, plugin types, and fixture subprocesses. Preserve both lint policies and the project-scope guard.
2. Put ordered pipelines and cached leaves in vite.config.ts. Declare Bun source, fixture, lock, and environment inputs explicitly, with no file tracing or restored fixture outputs. Keep the build cache and its content fingerprint together. Fix commands bypass caching.
3. Keep short package scripts, one browser inventory, and one capacity inventory. Run both compiler projects through the existing process runner. Restart calls build. Adopted proposal: Command interface@TASK-515.
4. Remove package-map.md, preserve current guidance in boundaries and ADR 0055, retain the separate Bun/Vitest trial as TASK-516, and update live command references. CI sets up Vite+ and retains task results.
5. TASK-515.01 repairs the observed tracer, fixture-isolation, and restored-build failures without weakening owners or limits. Require a complete passing gate and an unchanged cached repeat before closing both tasks. Inspect the final result for simplification and commit it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Bundled Oxlint adds diagnostics for noncapturing helpers and an empty mapped type. Fix these findings without suppressing rules. Bundled Oxfmt also requires whitespace updates in nine files.

The remote main commit is integrated through a linear rebase. The rebased committed tree matches the tree before rebasing, and no merge commit remains above origin/main. The first proposal code check introduces zero findings compared with current boards (41 existing findings in both). README staleness remains the TASK-500 follow-up: all 16 assets are stale, and this tooling change changes no pictured workflow.

Vite+ cached lint replays all four successful leaf results on a repeat call. The frontend cache restores a deleted index.html with the same SHA-256 digest. A native CLI probe also proves that --no-cache propagates through nested pipeline tasks. The environment audit separates analysis, test, and browser keys and excludes token values. The first complete gate passes: 4,901 module tests, 257 system tests, 136 repository tests, and all 19 browser files. The build retains its existing 500 kB bundle-size advisory.

The source invalidation probe exposed a Bun automatic-tracking gap: changing scripts/lint.ts replayed a cached result. The task configuration now includes explicit source and fixture globs alongside automatic tracking. Repeating the probe reports scripts/lint.ts modified and runs lint. The restored source then hits the cache. Changing NODE_OPTIONS also produces the expected environment cache miss.

CI now installs the pinned Vite+ release and package-manager version through setup-vp v1.21.2, restores task results after installation, and saves successful results with an OS/architecture key. The macOS inventory is the test:macos task. Chrome version joins the test environment fingerprint. INSTALL.md and package engines now state the Vite+ Node requirement. The workflow parses locally; hosted execution remains pending until these commits are pushed.

Command interface footprint against 3aa85af6a names Restart as changed by 8a7a5ef1c and reports no named-but-unchanged part. Commands changes only its internal artifact formatter (86e9f8bed), so its interface and responsibility remain correct. Server launcher contains the named Restart change. The 33-file migration commit is a tooling/format sweep, and the intervening stacked-label commit belongs to TASK-514. The proposal keeps all part and relationship ids and changes no interface.
<!-- SECTION:NOTES:END -->
