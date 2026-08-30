---
id: TASK-143.03.11
title: Integrate the Codex workbench into the operator shell
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.03.10
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/shell/tests/codex-workbench-integration.test.tsx
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the accepted text workbench frame into the existing operator shell and extend the existing PresentationDock with the active text source and Stop action. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shell.tsx mounts one workbench per eligible pane through the accepted frame, preserves Excalidraw ownership, pane/navigator/status/claim/doing flows, and introduces no second shell/workbench store.
- [ ] #2 The existing PresentationDock identifies the active text pane/workhorse/turn and keeps a labelled Stop control reachable in fullscreen without changing fullscreen ownership or inventing a second dock.
- [ ] #3 CSS consumes the semantic aesthetic contract for desktop, two-pane, collapsed, fullscreen, high contrast, reduced motion, and Flip touch without default assistant-ui/shadcn styling.
- [ ] #4 The named module test covers one registration, source identity, fullscreen Stop routing, unmount/reload, and unchanged shell/canvas behavior; TASK-143.03.13 owns rendered browser behavior.
<!-- AC:END -->
