---
id: TASK-500.24.04
title: apps/web holds the board canvas
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.24.03
parent_task_id: TASK-500.24
ordinal: 905000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First of two web steps: src/ui/variant-lifecycle and src/ui/semantic-board-canvas (213 files, 40,000 lines) move into apps/web in role folders. Root src modules reach them through the temporary #web/* entry. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/web/src/ui holds the canvas and variant lifecycle in role folders with their tests, the canvas stays private to the app, and the importers still in src/ui use #web/*
- [ ] #2 Lint overrides for the canvas (frame clock, shadcn and others) are relocated and probed, Tailwind still generates the same classes, and the full test:serial-browser lane passes
- [ ] #3 bun run check passes
<!-- AC:END -->
