---
id: TASK-500.23.01
title: Workbench shared contracts are browser-safe api files of the workbench package
status: To Do
assignee: []
created_date: '2026-10-19 14:13'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500.23
ordinal: 894000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First move of the workbench package (layer 7, the largest, about 60,000 lines). It creates packages/workbench and moves the bottom of its dependency order: shared/codex-realtime-contract, then shared/codex-browser-model, shared/codex-browser-gateway and shared/shown-conversation (about 6,000 lines). Later moves cannot import src/, so the order of 500.23.01 to .07 follows the import graph from the bottom.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench holds the four shared modules in shared/ role folders and a browser-safe, node-free api file (or a few) exposes them; every importer uses @archboard/workbench
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
