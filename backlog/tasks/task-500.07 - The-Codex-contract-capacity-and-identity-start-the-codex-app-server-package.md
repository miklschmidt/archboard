---
id: TASK-500.07
title: 'The Codex contract, capacity and identity start the codex-app-server package'
status: To Do
assignee: []
created_date: '2026-10-19 03:14'
labels: []
dependencies:
  - TASK-500.05
parent_task_id: TASK-500
ordinal: 872000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex-app-server is layer 5 of docs/design/package-map.md: one private app-server session over stdio. Its shared files come first because the browser uses them: shared/codex-app-server-contract (the authored wrapper plus the generated tree, ignored by git), shared/codex-app-server-capacity, shared/codex-workbench-identity (253 importers). The generated contract has a path that scripts/generate-codex-app-server-contract.ts, .gitignore, both oxlint configurations, the formatter exclusions, the postinstall hook and package.json scripts all name. A fresh clone must still generate it before lint and type checking, and the generator assumes its root exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/codex-app-server holds the contract wrapper, the capacity constants and the workbench identity in shared/ role folders with an exports interface, and every importer uses @archboard/codex-app-server
- [ ] #2 The generated contract is written under the package. scripts/generate-codex-app-server-contract.ts, .gitignore, the oxlint and formatter exclusions, postinstall, ensure:codex-contract and the lint and type-check chain name the new path, and a fresh clone with no generated output runs bun install and bun run check
- [ ] #3 The browser reaches only subpaths that hold no node: import, and the opt-in capacity test paths in package.json point at the new location
- [ ] #4 bun run check passes
<!-- AC:END -->
