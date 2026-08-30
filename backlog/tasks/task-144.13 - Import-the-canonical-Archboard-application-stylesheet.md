---
id: TASK-144.13
title: Import the canonical Archboard application stylesheet
status: To Do
assignee: []
created_date: '2026-08-30 15:38'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-144.02
  - TASK-144.03
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - frontend
parent_task_id: TASK-144
priority: high
type: task
ordinal: 235000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the frontend entry seam that imports `src/ui/theme/app.css` exactly once from `frontend/main.tsx` and removes the direct shell stylesheet link from `frontend/index.html`. Excalidraw vendor CSS remains a separate static asset.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frontend/main.tsx imports the canonical Archboard application stylesheet exactly once and frontend/index.html no longer links src/ui/shell/shell.css directly.
- [ ] #2 Excalidraw vendor CSS ordering remains explicit and a production build contains one Archboard application stylesheet without duplicate Tailwind output.
- [ ] #3 Focused build and rendered shell checks prove one/two-pane, fullscreen, and existing controls remain unchanged after the import-path move.
<!-- AC:END -->
