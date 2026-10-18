---
id: TASK-500.01
title: >-
  Lint and both tsconfig files resolve workspace packages, proven by the timing
  package
status: To Do
assignee: []
created_date: '2026-10-18 22:45'
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
- [ ] #1 packages/timing holds the timing code with an exports interface, and every importer uses @archboard/timing
- [ ] #2 The lint plugin owns packages/<name>/src, refuses a deep import into a package, applies the area rules inside a package and lets a package test import its own private files
- [ ] #3 Production code cannot import a tests folder or a testing export
- [ ] #4 bun run check passes, and docs/agents/boundaries.md describes packages beside the module rules that remain
<!-- AC:END -->
