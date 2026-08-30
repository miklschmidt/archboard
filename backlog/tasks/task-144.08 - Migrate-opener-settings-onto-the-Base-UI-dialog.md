---
id: TASK-144.08
title: Migrate opener settings onto the Base UI dialog
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-144.07
  - TASK-144.14
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
- [ ] #1 Opener settings uses public dialog and cn modules with semantic Tailwind utilities and deletes its replaced hand-rolled dialog interaction/presentation path; other shell dialogs stay unchanged.
- [ ] #2 Empty/open/editing/validating/busy/success/recoverable failure/terminal failure/cancelled states preserve code-target recovery and exact application behavior through src/ui/opener-settings.
- [ ] #3 Module tests at src/ui/opener-settings/tests cover state, Escape/outside dismissal, focus return, disabled actions, and one dialog owner; rendered verification belongs to TASK-144.11.
<!-- AC:END -->
