---
id: TASK-143.03.11
title: Integrate the Codex workbench into the operator shell
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.10
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
- [ ] #1 The operator shell supplies focused pane and public adapter props only; no runtime/server/generated protocol import or second workbench state owner enters `src/ui/shell`.
- [ ] #2 Existing claim/doing/take-back behavior survives while every empty, connected, linked, running, queued, approval, coordinator, reconnect, invalidated, completion, and failure state is reachable.
- [ ] #3 The canonical browser owner verifies keyboard paths, status announcements, both themes, one/two panes, collapse/expand, fullscreen, Samsung Flip touch targets, and unchanged Excalidraw interaction.
- [ ] #4 Production build inspection proves assistant-ui is used only through the runtime adapter and no deferred diff-review or per-hunk patch UI is bundled.
<!-- AC:END -->
