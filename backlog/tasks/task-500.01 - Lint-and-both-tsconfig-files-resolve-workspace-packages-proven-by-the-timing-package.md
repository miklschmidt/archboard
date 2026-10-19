---
id: TASK-500.01
title: >-
  Lint and both tsconfig files resolve workspace packages, proven by the timing
  package
status: Done
assignee: []
created_date: '2026-10-18 22:45'
updated_date: '2026-10-19 01:59'
labels: []
dependencies: []
references:
  - docs/design/package-map.md
parent_task_id: TASK-500
ordinal: 866000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The lint plugin and both tsconfig files know only src/<area>/<module>. Every later package move needs them to resolve @archboard/<name> through package.json exports first. timing has no dependency, so it proves the whole chain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/timing holds the timing code with an exports interface, and every importer uses @archboard/timing
- [x] #2 The lint plugin owns packages/<name>/src, refuses a deep import into a package, applies the area rules inside a package and lets a package test import its own private files
- [x] #3 Production code cannot import a tests folder or a testing export
- [x] #4 bun run check passes, and docs/agents/boundaries.md describes packages beside the module rules that remain
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workspaces, the timing package and lint support for packages. packages/timing holds the 14 timing files behind an exports interface (. and ./voice), and 186 importers use @archboard/timing. The oxlint plugin resolves @archboard/<name> through exports, refuses deep imports across packages, applies the area rules inside a package, lets a package test import its own private files, and keeps production code away from tests/ and ./testing. Inside a package, files import with # subpath imports (imports: #* for src, #tests/* for tests) and relative imports are refused everywhere; the plugin resolves # through the package manifest. Two Codex re-reviews: seven findings fixed; four remaining P2 edge cases (aliased mock import, absolute or file: mock paths, symlinked export targets, workspace links outside the checkout) were declined as adversarial. bun run check passes. No board is affected: no vault binding names a moved timing path.
<!-- SECTION:FINAL_SUMMARY:END -->
