---
id: TASK-144.14
title: Migrate the operator shell onto semantic theme tokens
status: To Do
assignee: []
created_date: '2026-08-30 15:38'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.13
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/shell.css
parent_task_id: TASK-144
priority: high
type: task
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the mechanical token consumption change in `src/ui/shell/shell.css`. Replace local TASK-140 token definitions with the canonical `src/ui/theme/app.css` semantic variables while preserving shell selectors, layout, reset behavior, and appearance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 shell.css defines no competing paper, ink, rule, cobalt, lime, typography, spacing, radius, focus, motion, or shadow token source after migration.
- [ ] #2 Selectors and resolved values preserve the completed TASK-140 desktop one/two-pane, fullscreen, light/dark, keyboard, pointer, and Samsung Flip presentation.
- [ ] #3 CSS/build fixtures and the existing shell browser owners fail on missing tokens or duplicate definitions and show no Excalidraw reset regression.
<!-- AC:END -->
