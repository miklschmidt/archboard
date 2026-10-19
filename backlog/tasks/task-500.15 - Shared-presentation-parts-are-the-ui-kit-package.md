---
id: TASK-500.15
title: Shared presentation parts are the ui-kit package
status: To Do
assignee: []
created_date: '2026-10-19 11:09'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 884000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ui-kit is layer 0 of docs/design/package-map.md: ui/components, dialog-parts, frame-clock, fullscreen-presentation, repository-name. workbench and code-opener draw with them, so they sit below both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/ui-kit holds the five ui modules in ui/ role folders (components, hooks, state) with api files, and every importer uses @archboard/ui-kit
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
