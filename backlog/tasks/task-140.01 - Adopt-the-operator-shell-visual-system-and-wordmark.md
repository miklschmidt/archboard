---
id: TASK-140.01
title: Adopt the operator shell visual system and wordmark
status: To Do
assignee: []
created_date: '2026-08-30 02:29'
updated_date: '2026-08-30 11:55'
labels: []
dependencies:
  - TASK-139
  - TASK-140.08
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: enhancement
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the existing shell from the TASK-111 neutral and brass treatment to the approved operator reference. A person should get a quieter, denser frame around the canvas while every real board, pane, persistence, connection, conflict, and action state stays visible and usable. TASK-139 lands first so this change can adopt the final fullscreen boundary instead of racing it. TASK-140.08 supplies the styling and Base UI foundation before this task migrates the complete shell.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The header uses the compact lowercase archboard wordmark without an icon tile and presents real board identity, pane, connection, vault, hold, and note state without mock data
- [ ] #2 Light and dark themes use the TASK-140.08 token system with the reference cobalt selection and lime status accents, accessible text and control contrast, visible focus, and no gradient or glow decoration
- [ ] #3 Open, new, split, clear, opener settings, theme, conflict recovery, notices, and contextual scratch naming remain reachable with accurate labels and states
- [ ] #4 The canvas receives the largest share of the desktop workspace, and one-pane, two-pane, fullscreen, and 420 pixel layouts fit without clipping or hiding essential controls
- [ ] #5 Stable browser checks exercise the rendered light and dark desktop shells and the narrow shell, and current screenshots are inspected through the real application
<!-- AC:END -->
