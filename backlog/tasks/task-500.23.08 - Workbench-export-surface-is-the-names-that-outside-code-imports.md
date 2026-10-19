---
id: TASK-500.23.08
title: Workbench export surface is the names that outside code imports
status: To Do
assignee: []
created_date: '2026-10-19 16:36'
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
- [ ] #1 Every api file of packages/workbench lists only names that code outside the package imports; api files with no outside importer and their package exports are removed (scan with the unused-name check of the earlier consolidation)
- [ ] #2 docs/agents/boundaries.md and docs/design/package-map.md state the final subpaths and counts; package-api and package-graph tests pass
- [ ] #3 bun run check passes
<!-- AC:END -->
