---
id: TASK-143.03.11
title: Integrate the Codex workbench into the operator shell
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.10
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/shell/AgentWorkbench.tsx
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the claim-only composition inside `src/ui/shell/AgentWorkbench.tsx` with the public `src/ui/workbench-frame` root while keeping `Shell.tsx` a mechanical caller. This leaf owns the existing shell workbench module and its rendered integration owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The operator shell supplies focused pane and public adapter props only; no runtime/server/generated protocol import or second workbench state owner enters src/ui/shell.
- [ ] #2 Existing claim/doing/take-back behavior survives and every text-workbench empty, connected, linked, running, queued, approval, coordinator, reconnect, invalidated, completed, and failure state is reachable.
- [ ] #3 Integration tests at src/ui/shell/tests/agent-workbench.test.ts verify the mechanical Shell caller, keyboard/status behavior, collapse/expand, fullscreen coexistence, and unchanged Excalidraw interaction; canonical cross-module browser coverage belongs to TASK-143.03.13.
- [ ] #4 Production build inspection proves assistant-ui is used only through workbench-runtime and no diff-review, per-hunk patch, assistant transport, or mock data is bundled.
<!-- AC:END -->
