---
id: TASK-144.14
title: Integrate semantic tokens into the operator shell stylesheet
status: To Do
assignee: []
created_date: '2026-08-30 15:38'
updated_date: '2026-08-30 18:00'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.09
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
Map existing shell CSS declarations to the canonical semantic token variables without rewriting Shell.tsx markup, utility-classifying the shell, or redesigning it. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing shell selectors/layout/markup remain; color, typography, radius, spacing, elevation, state, and motion values consume canonical semantic variables where equivalent.
- [ ] #2 No Shell.tsx class migration, stylesheet rewrite, Tailwind utility conversion, layout change, or default shadcn aesthetic is introduced; Excalidraw reset/CSS remains isolated.
- [ ] #3 Rendered equivalence at desktop and Flip viewports covers light/dark/high-contrast/reduced-motion and detects token, overflow, focus, and touch regressions.
- [ ] #4 The integration follows the prior aesthetic guide and operator-shell reference; a markup/class migration requires separately split component tasks.
- [ ] #5 The existing shell-layout browser owner is run at desktop and Flip viewports before and after the CSS-only change and proves light, dark, high-contrast, reduced-motion, focus, overflow, and touch equivalence.
<!-- AC:END -->
