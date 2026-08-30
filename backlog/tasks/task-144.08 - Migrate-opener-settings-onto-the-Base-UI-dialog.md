---
id: TASK-144.08
title: Migrate opener settings onto the Base UI dialog
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.07
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/opener-settings
parent_task_id: TASK-144
priority: high
type: task
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use `src/ui/opener-settings` as the first real consumer of the Tailwind/Base UI foundation. Replace only that module's hand-rolled dialog behavior and migrated CSS; other shell dialogs remain unchanged until separately assigned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opener settings uses the public dialog and class-composition modules with semantic Tailwind utilities and deletes the replaced local presentation/interaction path.
- [ ] #2 Open, validation, success, failure, cancel, Escape, dismissal, focus return, disabled/busy, and code-target recovery behavior remains identical through the module's public interface.
- [ ] #3 Both themes, supported desktop/Samsung Flip touch behavior, production build, existing opener module tests, and the canonical serial browser owner pass with unchanged Excalidraw behavior.
<!-- AC:END -->
