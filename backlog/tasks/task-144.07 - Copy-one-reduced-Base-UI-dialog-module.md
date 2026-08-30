---
id: TASK-144.07
title: Copy one reduced Base UI dialog module
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.04
  - TASK-144.05
  - TASK-144.06
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/dialog
parent_task_id: TASK-144
priority: high
type: task
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the first reviewed shadcn/Base UI source slice in `src/ui/dialog`. Add `@base-ui/react` and only dependencies this reduced dialog actually imports; application state stays outside.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The named module exposes the minimum dialog composition needed by Archboard and removes unused registry variants, dependencies, default palette styling, icon systems, and generic dashboard treatment.
- [ ] #2 Keyboard focus trap/return, Escape, outside dismissal, labelling/descriptions, disabled actions, portal stacking, and visible focus work under the existing shell isolation.
- [ ] #3 The module uses semantic Tailwind utilities, passes the repository's existing strict native Oxlint React/jsx-a11y/type-aware baseline without weakening or custom Tailwind rules, and owns no board/application state.
<!-- AC:END -->
