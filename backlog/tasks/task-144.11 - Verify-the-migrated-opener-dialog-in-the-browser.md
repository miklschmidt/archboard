---
id: TASK-144.11
title: Verify the migrated opener dialog in the browser
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-144.08
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/opener-settings.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the existing opener browser owner after migration. Delegation profile: gpt-5.6-sol, high because this is rendered interaction and accessibility verification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser owner proves trigger naming, initial focus, focus trap, Tab order, Escape dismissal, outside dismissal policy, portal placement, focus return, labels/descriptions, validation announcement, disabled/save/cancel behavior, and no background interaction.
- [ ] #2 It verifies light/dark/high-contrast, reduced motion, keyboard, screen-reader accessibility tree, 44px Flip targets, and unchanged opener persistence at the supported viewport.
- [ ] #3 No unexpected browser/server logs, duplicate dialog roots, focus leaks, or direct Radix/shadcn runtime behavior are tolerated.
- [ ] #4 The canonical existing browser inventory remains one owner; this task does not create a second opener test or register unrelated workbench tests.
<!-- AC:END -->
