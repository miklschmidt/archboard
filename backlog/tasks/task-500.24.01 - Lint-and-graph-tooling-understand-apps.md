---
id: TASK-500.24.01
title: Lint and graph tooling understand apps
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.23
parent_task_id: TASK-500.24
ordinal: 902000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apps are layer-8 workspaces that hold what the packages left. Before any file moves, the lint plugin, the graph and api tests, the workspace list and the TypeScript and lint scopes must know apps, or the moved code silently loses its rules (the class of regression fixed in c55f6a9bd for package UI). Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One owner parser distinguishes packages from apps; apps/* is a workspace; the plugin rules, tsconfig, lint and test scopes listed in docs/design/apps-migration.md cover apps/<name>/src and tests, with the temporary #web/* root entry allowed only for the web move
- [ ] #2 tests/system/repository-policy fixtures prove app-local # imports, package-to-app and app-to-app refusals, own-test access, browser-entry limits, UI placement and policy routing, layer-8 graph edges and the api scan over apps, before any production file moves
- [ ] #3 bun run check passes
<!-- AC:END -->
