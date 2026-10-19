---
id: TASK-500.24.01
title: Lint and graph tooling understand apps
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 19:09'
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
- [x] #1 One owner parser distinguishes packages from apps; apps/* is a workspace; the plugin rules, tsconfig, lint and test scopes listed in docs/design/apps-migration.md cover apps/<name>/src and tests, with the temporary #web/* root entry allowed only for the web move
- [x] #2 tests/system/repository-policy fixtures prove app-local # imports, package-to-app and app-to-app refusals, own-test access, browser-entry limits, UI placement and policy routing, layer-8 graph edges and the api scan over apps, before any production file moves
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. source-layout.ts: one workspace owner parser (packages|apps) with root identity; manifest lookup, # resolution and test owners for both; root src resolves # through the root manifest.
2. module-rules: app target before package exports, own-app and temporary #web/* allowance, unresolved # fails.
3. layout-rules/ui-rules: entries, flat source, mapped paths, lib bucket for workspace src, state descendants, UI paths and main.tsx.
4. configs, scripts, tsconfigs, workspace list; three skeleton app manifests with tests/.gitkeep so the apps/*/tests globs match.
5. Fixture tests in boundaries, ui-lint-policy, package-graph, package-api.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The lint plugin, oxlint configs, root scripts, tsconfigs and repository-policy tests understand apps/{cli,server,web} (layer 8) before any code moves; skeleton private apps and a temporary root #web/* entry exist. Codex reviewed c7f64f93a (identical diagnostics on 2,685 existing files, all old policy tests pass); two findings (bare @archboard-app/* imports bypassing lint; canvas clock override missing app paths) fixed in f03c5ca8c with tests. bun run check exited 0 on both commits.
<!-- SECTION:FINAL_SUMMARY:END -->
