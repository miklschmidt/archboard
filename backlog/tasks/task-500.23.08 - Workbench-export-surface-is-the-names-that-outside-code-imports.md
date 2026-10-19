---
id: TASK-500.23.08
title: Workbench export surface is the names that outside code imports
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 16:36'
updated_date: '2026-10-19 18:17'
labels: []
dependencies:
  - TASK-500.23.07
parent_task_id: TASK-500.23
ordinal: 901000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moving the workbench in seven steps moved the importers of its api names into the package. After 500.23.05 several api files (the runtime coordinator, workhorses, epoch, thread-link and instructions files, and parts of the shared browser-model and approvals files) list names that no code outside the package imports. Dropping them last, once the UI has moved in, leaves the package with the few interface files its callers need (docs/design/package-map.md: ./browser-contract, ./runtime, ./ui).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every api file of packages/workbench lists only names that code outside the package imports; api files with no outside importer and their package exports are removed (scan with the unused-name check of the earlier consolidation)
- [x] #2 docs/agents/boundaries.md and docs/design/package-map.md state the final subpaths and counts; package-api and package-graph tests pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scan every workbench export with the AST scan (/tmp/pm/api/scan.ts): names that src, tests, scripts, frontend or other packages import. 2. Drop every other name; derive TalkOptions and ThreadLinkActionSnapshot in their one src test. 3. Regroup the 160 remaining names into 8 api files by caller concern: shared browser-contract; runtime runtime; server server, panes, host; ui controllers, agent, voice. 4. Rewrite importers with regroup.ts (definition-checked), delete the old api files and exports. 5. Update boundaries.md and package-map.md. 6. Verify: tsc x2, lint, workbench tests, repository-policy, load/cycles/browser trace, build:frontend, bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The workbench exports 8 subpaths and 160 names (from 43 and 458): ./browser-contract, ./controllers, ./agent and ./voice are browser-safe; ./runtime, ./server, ./panes and ./host run in Bun. Every name has an outside importer. Codex reviewed 1ec9871fd: 312 bindings across 66 importers matched; one stale doc example fixed. bun run check passed (the test lanes use --isolate; 5 subtitle tests fail without it, an existing isolation need).
<!-- SECTION:FINAL_SUMMARY:END -->
