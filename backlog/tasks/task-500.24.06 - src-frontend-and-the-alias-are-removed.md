---
id: TASK-500.24.06
title: 'src/, frontend/ and the @/ alias are removed'
status: Done
assignee: []
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 22:15'
labels: []
dependencies:
  - TASK-500.24.05
parent_task_id: TASK-500.24
ordinal: 907000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the three apps are in, root src/ and frontend/ hold nothing. The @/ alias, the temporary #web/* entry and the old module-policy branches in the lint plugin are dead and are removed, and live docs name the final layout. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/ and frontend/ do not exist; @/ is gone from tsconfig, Vite and the lint resolver and a reintroduced legacy root is refused; the old module parser is deleted
- [x] #2 docs/agents/boundaries.md, package-map.md, INSTALL.md, TESTING.md, AGENTS.md, docs/readme/assets.json, evals/coverage.json and the readme lockup test name the final layout
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Plugin: delete the root-module model (moduleAt, SourceModule, ROOT_* constants, isRootSource, #web allowance, the @/ resolution) and refuse any file under top-level src/ or frontend/ and any @/ import with a clear message. 2. Port or delete the fixture tests of boundaries, app-boundaries, ui-lint-policy; add a repository policy test for the end state. 3. Configs and scripts: tsconfig paths, oxlintrc globs, package.json lanes, ci.yml, scripts, staleness.ts, provenance.ts, frontend-build.ts, .prettierignore. 4. Docs: boundaries.md, package-map.md, apps-migration.md, test-suite, frontend, strict-analysis, INSTALL, TESTING, AGENTS, skills, readme asset sources, evals coverage. 5. Gate: tsc x2, lint, fmt:check, repository tests, build:frontend, full bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root src/, frontend/ and the @/ alias are gone; the lint plugin lost the root-module model and refuses legacy roots and @/ imports; configs, scripts, staleness and provenance name only packages and apps; live docs describe the final layout. Codex reviewed eebccc55c, 267a0adb1 and 631a69ad4 and fixed findings in four commits (2867da9e0, 067ab00f8, ae7aa1ae2, 0463ccab3); the old and new plugins give identical diagnostics on 1,864 policy files and 805 test files. bun run check exited 0 on the three commits.
<!-- SECTION:FINAL_SUMMARY:END -->
