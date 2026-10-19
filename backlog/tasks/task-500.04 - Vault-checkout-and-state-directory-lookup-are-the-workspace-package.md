---
id: TASK-500.04
title: 'Vault, checkout and state-directory lookup are the workspace package'
status: To Do
assignee: []
created_date: '2026-10-19 01:59'
labels: []
dependencies:
  - TASK-500.03
parent_task_id: TASK-500
ordinal: 869000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
workspace is layer 2 of docs/design/package-map.md: shared/repositories, shared/language-servers, and from runtime/engine the vault-finder, repo-registry, git and its lib files, state-dir, source-checkout, atomic-write and module-paths, plus server/archboard/lib/repositories. atomic-write stays public because the repository registry and the code opener also use it. shared/language-servers imports node:path and the canvas reaches it through shared/code-check, so the package needs a browser subpath with no Node import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workspace holds the listed sources in role folders with an exports interface that includes atomic-write, and every importer uses @archboard/workspace
- [ ] #2 A browser subpath of workspace holds no node: import, and the canvas imports only that subpath
- [ ] #3 The tests of the moved code live in packages/workspace/tests
- [ ] #4 bun run check passes
<!-- AC:END -->
