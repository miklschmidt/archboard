---
id: TASK-144.14
title: Migrate the operator shell onto semantic theme tokens
status: To Do
assignee: []
created_date: '2026-08-30 15:38'
updated_date: '2026-08-30 16:25'
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
Migrate the completed operator shell to semantic theme utilities without redesigning it. Delegation profile: gpt-5.6-sol, high because TASK-140/reference-mockup visual fidelity is the authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shell markup/classes map the existing visual hierarchy, density, surfaces, typography, focus, claim/doing, panes, navigator, status, and fullscreen treatment to semantic tokens without changing behavior or layout ownership.
- [ ] #2 Obsolete shell declarations are removed only after equivalent semantic utilities exist; Excalidraw CSS/reset remains isolated and no default shadcn aesthetic leaks in.
- [ ] #3 Rendered comparison at desktop and Samsung Flip viewports covers light/dark/high-contrast/reduced-motion and detects token, overflow, focus, and touch-target regressions.
- [ ] #4 The migration follows docs/design/operator-canvas-shell.md and the aesthetic guide; deviations require an explicit reviewed contract change.
<!-- AC:END -->
