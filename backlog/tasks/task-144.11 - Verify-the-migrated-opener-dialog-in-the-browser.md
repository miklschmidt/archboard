---
id: TASK-144.11
title: Verify the migrated opener dialog in the browser
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
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
Own the rendered regression update for the migrated Base UI opener dialog in the existing canonical browser owner `tests/system/browser/opener-settings.test.ts`. It adds no application behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner verifies open, validation, success, failure, cancel, Escape, outside dismissal, focus trap/return, disabled and busy actions, and code-target recovery through rendered behavior.
- [ ] #2 Both themes, desktop keyboard/pointer, Samsung Flip touch targets, portal stacking, visible focus, and accessible name/description remain correct.
- [ ] #3 The browser owner proves there is one dialog behavior path, unchanged Excalidraw interaction, and cleanup under the existing serial lane.
<!-- AC:END -->
