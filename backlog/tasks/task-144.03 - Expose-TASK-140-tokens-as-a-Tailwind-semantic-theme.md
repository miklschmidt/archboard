---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.02
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/theme
parent_task_id: TASK-144
priority: high
type: task
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the light/dark token map and Tailwind `@theme inline` aliases in `src/ui/theme`. The merged TASK-140 shell and its reference document are the visual authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One namespaced source owns paper/surfaces, ink/muted/rules, cobalt selection, acid-lime status, danger/warning, Onest/DM Mono roles, spacing, small radii, focus, restrained motion, and shadow values for both themes.
- [ ] #2 Tailwind exposes semantic utilities from those variables; this leaf does not rewrite the whole shell or introduce a second token source.
- [ ] #3 Focused CSS/build fixtures and rendered light/dark desktop comparison prove each semantic token resolves and the existing operator shell appearance remains authoritative.
<!-- AC:END -->
