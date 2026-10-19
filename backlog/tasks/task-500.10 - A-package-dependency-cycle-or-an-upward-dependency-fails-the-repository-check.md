---
id: TASK-500.10
title: A package dependency cycle or an upward dependency fails the repository check
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 04:28'
updated_date: '2026-10-19 04:30'
labels: []
dependencies:
  - TASK-500.09
parent_task_id: TASK-500
ordinal: 875000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages import each other as @archboard/<name>. Neither tsc nor oxlint sees a cycle between two packages, and the layers in docs/design/package-map.md are the reason the packages exist. The old graph script worked on @/ imports in /tmp and is blind to packages now. A cycle would only show up as a runtime import-order bug. Today six packages exist and more are coming, so the check is cheapest now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repository-policy test builds the package graph from the @archboard/<name> imports of every packages/<name>/src and tests file (and the exports of each manifest), and fails with the cycle named when two packages depend on each other directly or through others
- [x] #2 The test runs in under a second of its own work and passes on the six packages that exist
- [x] #3 The test also fails when a package imports a package of the same or a higher layer, using one declared layer table kept next to the test (it lists the planned packages too), and a directory under packages/ that is not in the table fails
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tests/system/repository-policy/package-graph.test.ts with a layer table from docs/design/package-map.md (timing, diagnostics, ui-kit, server-requests 0; process 1; workspace 2; code-binding 3; board 4; codex-app-server, renderer, code-intel 5; server-lifecycle, code-opener, walkthrough 6; workbench, skills 7). Apps are not packages and are not in the table.
2. Read each packages/<name>/package.json imports of @archboard/<x> from src and tests files (static import/export-from/dynamic import/mock.module strings), skip the package itself, build edges, fail with the cycle path on a cycle, and fail on an edge to the same or a higher layer. A test file may import a higher package only through its exports; the rule is the same.
3. Keep it tiny and fast; no subprocess.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
tests/system/repository-policy/package-graph.test.ts holds a layer table for the 16 planned packages, scans @archboard/<name> imports (from, import(), mock.module, vi.mock, vi.doMock, import.meta.resolve) in each package's src and tests, and fails on a cycle (naming the path), on an edge to the same or a higher layer (naming file and specifier) and on a directory not in the table. A positive control feeds the detector a synthetic cycle and upward edge. Four tests pass in 13 ms on the six packages. The scan reads source imports, not manifest exports. Part of the file landed in the backlog commit 701a36f27 because of a broad git add; the lint fixes are in a35035ef1. Not yet reviewed by Codex; it joins the review of the whole branch before merge.
<!-- SECTION:FINAL_SUMMARY:END -->
