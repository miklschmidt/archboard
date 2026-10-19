---
id: TASK-500.23.06
title: >-
  Workbench UI base: transport, runtime, thread, timeline, composer and realtime
  audio
status: To Do
assignee: []
created_date: '2026-10-19 14:14'
updated_date: '2026-10-19 16:59'
labels: []
dependencies:
  - TASK-500.23.05
parent_task_id: TASK-500.23
ordinal: 899000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sixth move: the UI modules with no workbench UI above them: workbench-transport, workbench-timeline, workbench-thread-link, workbench-runtime, workbench-thread, workbench-composer, voice-output-level, codex-realtime and codex-workbench-media (about 30,000 lines). Their api files are browser-safe. Tailwind scans packages/*/src/ui already (src/ui/theme/app.css).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench/src/ui holds those modules in role folders with browser-safe api files, and they are gone from src/ui
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move the nine UI modules into packages/workbench/src/ui in role folders (components, hooks, state, clients, rules) with tests in packages/workbench/tests/ui. Unbarrel the nine index.ts files, rewrite importers by name to eight browser-safe api files (src/ui/api), point the assistant-ui lint ownership at the thread and runtime folders, update docs and the ADOPTERS entry. Verify with tsc, lint, the package and policy tests, the browser trace and build:frontend, then bun run check.
<!-- SECTION:PLAN:END -->
