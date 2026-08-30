---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-144.01
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
Own `src/ui/theme/app.css` as the one Archboard application stylesheet and semantic token source. It imports Tailwind theme/utilities without Preflight, defines light/dark TASK-140 variables and `@theme inline` aliases, then imports the shell stylesheet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app.css has one Tailwind 4 import path with Preflight disabled and imports src/ui/shell/shell.css once after semantic theme declarations; opener/module CSS can remain explicit until migrated.
- [ ] #2 One namespaced source owns paper/surfaces, ink/muted/rules, cobalt, acid-lime, danger/warning, Onest/DM Mono, spacing, small radii, focus, restrained motion, and shadow values in light/dark.
- [ ] #3 Tailwind exposes named semantic utilities from those variables without default-palette visual direction, duplicate tokens, dynamic class interpolation, or a whole-shell rewrite.
- [ ] #4 Tests at src/ui/theme/tests prove every variable/utility resolves, Preflight is absent, import order is deterministic, and rendered TASK-140 appearance remains authoritative.
<!-- AC:END -->
