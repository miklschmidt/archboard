---
id: TASK-125
title: Adopt Oxide tooling and modernize dependencies
status: Done
assignee:
  - '@codex'
created_date: '2026-08-26 00:50'
updated_date: '2026-08-26 02:56'
labels: []
dependencies: []
type: chore
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Install current direct runtime and development dependencies, adopt oxfmt and oxlint configuration from /home/msc/Projects/new-design-era, and establish donor-style deep-module enforcement without weakening Archboard's existing checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 package.json and the lockfile pin the latest available oxfmt and oxlint releases
- [x] #2 Archboard has adapted oxfmt and oxlint configuration based on new-design-era, including applicable custom rules
- [x] #3 Repository scripts run the formatter and linter through bun and preserve existing type-check and test enforcement
- [x] #4 oxfmt check and the pre-existing type-check/test paths remain runnable; oxlint executes the full adapted rule set and reports the expected migration violations without rules being weakened to force a green baseline
- [x] #5 All direct runtime and development dependencies are pinned to their latest stable registry releases, with major-version compatibility changes adapted in source and tests
- [x] #6 tsconfig adopts the donor's modern module-resolution and diagnostic strictness settings for TypeScript 7 without changing Archboard's runtime entrypoints or emit-free build model
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin every direct runtime and development dependency to its latest stable release with Bun. Adapt major-version compatibility breaks without changing Archboard's product behavior.
2. Add adapted oxfmt and oxlint configs plus an Archboard custom plugin. Enforce donor-style src/<area>/<module> placement, area dependency directions, module-root entrypoints, private implementation subfolders, tests through entrypoints, private test fixtures, and no cycles.
3. Document the target deep-module layout and import rules that the plugin encodes.
4. Add lint, fix, format, format-check, and all-in-one validation scripts without removing any existing test suite.
5. Move TypeScript 7 to Bundler resolution, forced module detection, verbatim module syntax, and the donor's diagnostic strictness. Enable type-aware oxlint with its current bridge.
6. Run oxfmt over the repository, prove the custom module rules fail on temporary violations, then verify dependency versions, formatting, linter findings, TypeScript behavior, frontend build, existing suites, skill sync, and diff hygiene.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delegated surviving-code TypeScript 7 and dependency compatibility to Codex task 01a03b9f-4e24-7a20-8e3a-4819b7cd2a1f. TASK-124 MCP deletion runs independently in 01a03b9d-d80e-7070-a882-a38f36d03ec1. Parent owns reconciliation, review, broad validation, and TASK-125 finalization.

Reconciled compatibility commit 4125b9e into the parent working tree after scope review. TypeScript 7 now reports exactly seven TS1484 errors, confined to TASK-124-owned src/core/injection.ts and src/core/mcp-dispatch.ts; surviving backend and frontend compatibility changes are integrated without weakening checks.

Integrated TASK-124 CLI-only deletion and compatibility harness commit 7db7c03. Parent validation: bun run test passed the complete 26-suite chain, including all four sequential browser checks; type-check, build, formatter, skill sync, frozen install, and dependency freshness also pass. Oxlint runs the full strict donor/custom configuration and reports the expected migration baseline (764 errors across 121 files). High review found three boundary-plugin bypasses and missing frontend diagnostic flags; remediation is routed to the existing TASK-125 worker.

Final integrated result: oxfmt 0.65.0, oxlint 1.80.0, oxlint-tsgolint 7.0.2001, and TypeScript 7.0.2 are pinned with every direct dependency at the current registry latest. Donor-derived format/lint/strict TypeScript settings are active. The custom Archboard plugin enforces mapped src/<area>/<module>/<file> placement, area directions, module entrypoints, private tests, test placement, query-suffixed imports, static require imports, and cycles; test:boundaries proves all eight focused cases and is part of the 27-suite push chain. bun install --frozen-lockfile, bun outdated, build, type-check, fmt:check, skill sync, git diff --check, and the full sequential bun run test pass. Oxlint deliberately remains red with 763 migration errors under the full unweakened rules. Independent complete-range Standards and Spec reviews are REVIEW_CLEAN at 0847d1f7dfa2077e21064ec63d01dc1f46bcea6e.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Modernized every direct dependency, adopted oxfmt/oxlint and TypeScript 7 strictness from the donor project, and added documented deep-module structure and import-boundary enforcement with executable regression fixtures. Adapted React 19, Express 5, Vite 8, and TypeScript 7 compatibility without weakening checks. Verified with current-version audits, build/type/format checks, all 27 sequential suites, an intentional 763-error lint migration baseline, and clean independent Standards and Spec reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
