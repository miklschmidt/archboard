---
id: TASK-500.23.07
title: 'Workbench UI top: the workbench panes, approvals, queue, agent setup and voice'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 14:14'
updated_date: '2026-10-19 17:54'
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
- [x] #1 packages/workbench holds the seven UI modules in ui/ role folders with browser-safe api files, and no workbench module is left in src/
- [x] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move workbench, agent-setup, workbench-approvals, workbench-queue, voice-orb, voice-subtitles, voice-session into packages/workbench/src/ui role folders (components, hooks, state, clients, rules by behavior: dock, panel, voice, orb, subtitles, surfaces, agent-setup, approvals, approval-forms, queue, voice-session), tests into packages/workbench/tests/ui. Nine barrels removed; eight browser-safe api files (agent-setup, agent-surfaces, voice-surface, voice-subtitles, voice-orb, voice-session, approvals-controller, queue-controller). Update the frame-clock lint override to the subtitles folders, docs, build:frontend CSS hash check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The seven workbench UI modules (141 files) live in packages/workbench/src/ui behind eight more browser-safe api files; no workbench module is left in src/ui. Codex reviewed 99fada20b and found no behavior defect but two lint-coverage regressions (package UI tests and source were no longer held to the src/ui policy); fixed in c55f6a9bd and a follow-up, then reviewed again. bun run check passed on the move; every lane passed on the lint fix.
<!-- SECTION:FINAL_SUMMARY:END -->
