---
id: TASK-500.23.07
title: 'Workbench UI top: the workbench panes, approvals, queue, agent setup and voice'
status: To Do
assignee: []
created_date: '2026-10-19 14:14'
labels: []
dependencies:
  - TASK-500.23.06
parent_task_id: TASK-500.23
ordinal: 900000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seventh move: ui/workbench, agent-setup, workbench-approvals, workbench-queue, voice-orb, voice-subtitles and voice-session. After it the workbench package is complete and no workbench module is left in src/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/workbench holds the seven UI modules in ui/ role folders with browser-safe api files, and no workbench module is left in src/
- [ ] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
